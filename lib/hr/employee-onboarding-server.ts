import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { assertEmployeeCapability } from "@/lib/hr/employee-auth";
import { isPrivilegedTargetUser } from "@/lib/capabilities/employee";
import { PROFILE_MANAGER_FIELD } from "@/lib/hr/employee-scope";
import {
  buildEmployeeProfilePayload,
  validateEmployeeProfileForm,
  type EmployeeProfileFormInput,
  type EmployeeProfileValidationError,
} from "@/lib/hr/employee-profile-payload";
import {
  employeeRolePresetById,
  HR_ROLE_PRESET_FIELD,
  type EmployeeRolePresetId,
} from "@/lib/hr/employee-role-presets";
import { emitEmployeeAuditEvent, EMPLOYEE_AUDIT_EVENTS } from "@/lib/hr/employee-audit";
import {
  assignEmployeeMembership,
  resolvePrimaryEntityForEmployeeCreate,
} from "@/lib/master-data/membership";
import {
  assertAppointablePositionForCreate,
  assertRecruitmentTargetPosition,
} from "@/lib/hr/recruitable-positions-server";

export type CreateEmployeeByHrInput = EmployeeProfileFormInput & {
  email: string;
  password: string;
  /** Optional ERP module preset — defaults to staff. Not organization jabatan. */
  role_preset_id?: string;
  dashboard_access?: boolean;
  /** Organization structure position (recruitment TARGET — required). */
  org_position_id: string;
  primary_entity_id?: string;
};

export type CreateEmployeeByHrResult = {
  userId: string;
  profileId: string;
  orgPositionId: string;
  /** True when active org assignment was created (appointment authority). */
  appointmentCreated: boolean;
  /**
   * True when employee was created as recruitment target without appointment.
   * Phase 35I-I/J: approval workflow queues hr_recruitment_requests for hierarchy approver.
   */
  appointmentPending: boolean;
  /** Pending recruitment request id when appointmentPending. */
  recruitmentRequestId?: string | null;
};

function mapProfileValidationError(code: EmployeeProfileValidationError): string {
  switch (code) {
    case "office_required":
      return "Kantor / lokasi kerja wajib dipilih.";
    case "saturday_partial":
      return "Sabtu: isi jam masuk dan jam pulang keduanya, atau kosongkan keduanya.";
    case "sunday_partial":
      return "Minggu: isi jam masuk dan jam pulang keduanya, atau kosongkan keduanya.";
    default:
      return "Data profil tidak valid.";
  }
}

export async function serverCreateEmployeeByHr(
  adminPb: PocketBase,
  _ctx: HrApiAuthContext,
  input: CreateEmployeeByHrInput,
): Promise<CreateEmployeeByHrResult> {
  const emailTrim = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  if (!emailTrim || !password) {
    throw new HrApiError("Email dan kata sandi wajib diisi.", 400);
  }
  if (password.length < 8) {
    throw new HrApiError("Kata sandi minimal 8 karakter.", 400);
  }

  // ERP access preset (capability compatibility) — NOT organization jabatan.
  const presetId = String(input.role_preset_id ?? "").trim() || "staff";
  const preset = employeeRolePresetById(presetId) || employeeRolePresetById("staff");
  if (!preset) {
    throw new HrApiError("Preset akses ERP tidak valid.", 400);
  }

  const syntheticTarget = {
    role_code: preset.roleCode,
    account_type: "user",
    inventory_role: preset.inventoryRole,
  };
  if (isPrivilegedTargetUser(syntheticTarget)) {
    assertEmployeeCapability(_ctx, "employee.manage_hr_accounts");
  } else {
    assertEmployeeCapability(_ctx, "employee.create");
  }

  const profileErr = validateEmployeeProfileForm(input);
  if (profileErr) {
    throw new HrApiError(mapProfileValidationError(profileErr), 400);
  }

  const displayName = (
    input.name?.trim() ||
    emailTrim.split("@")[0] ||
    "Karyawan"
  ).trim();

  const primaryEntityId = await resolvePrimaryEntityForEmployeeCreate(
    adminPb,
    _ctx,
    input.primary_entity_id,
  );

  // Recruitment TARGET — administrative (any valid company position). Not appointment.
  const orgPos = await assertRecruitmentTargetPosition(
    adminPb,
    _ctx,
    String(input.org_position_id ?? ""),
    primaryEntityId,
  );

  // Appointment authority is separate — try resolve without failing recruitment.
  let canAppoint = false;
  try {
    await assertAppointablePositionForCreate(adminPb, _ctx, orgPos.id, primaryEntityId);
    canAppoint = true;
  } catch (e) {
    if (e instanceof HrApiError && e.code === "ORG_APPOINTMENT_DENIED") {
      canAppoint = false;
    } else {
      throw e;
    }
  }

  let userId: string | null = null;
  try {
    const user = await adminPb.collection("users").create({
      email: emailTrim,
      password,
      passwordConfirm: password,
      name: displayName,
      account_type: "user",
      role_code: preset.roleCode,
      role: preset.roleCode,
      inventory_role: preset.inventoryRole,
      [HR_ROLE_PRESET_FIELD]: preset.id as EmployeeRolePresetId,
      dashboard_access:
        typeof input.dashboard_access === "boolean"
          ? input.dashboard_access
          : preset.defaultDashboard,
      status: "inactive",
      locale: "id",
    });
    userId = String(user.id);

    const { deriveSuperiorFromPosition } = await import("@/lib/hr/org-position-server");
    const superior = await deriveSuperiorFromPosition(adminPb, orgPos.id);

    const profilePayload = buildEmployeeProfilePayload({
      ...input,
      name: displayName,
      email: emailTrim,
      position: orgPos.name,
      department: input.department?.trim() || orgPos.department || "",
      division: input.division?.trim() || orgPos.division || "",
    });
    // Target position (recruitment) — may not yet be active appointment.
    profilePayload.org_position_id = orgPos.id;
    profilePayload[PROFILE_MANAGER_FIELD] = superior.superiorUserId || null;

    const profile = await adminPb.collection("profiles").create({
      user: userId,
      ...profilePayload,
    });

    await assignEmployeeMembership(
      adminPb,
      _ctx,
      userId,
      {
        primaryEntityId,
      },
      displayName,
    );

    let appointmentCreated = false;
    let recruitmentRequestId: string | null = null;
    if (canAppoint) {
      const { createOrgAssignment } = await import("@/lib/hr/org-assignment-server");
      await createOrgAssignment(adminPb, _ctx, {
        userId,
        companyId: primaryEntityId,
        orgPositionId: orgPos.id,
      });
      appointmentCreated = true;
    } else {
      // Phase 35I-J — queue for hierarchy-derived approver (Meja Kerja).
      // Phase 35I-K-P1: do not soft-fail — missing queue is a security/workflow failure.
      try {
        const { createPendingRecruitmentRequest } = await import(
          "@/lib/hr/recruitment-request-server"
        );
        const pending = await createPendingRecruitmentRequest(adminPb, _ctx, {
          candidateUserId: userId,
          candidateName: displayName,
          candidateEmail: emailTrim,
          companyId: primaryEntityId,
          orgPositionId: orgPos.id,
          orgPositionName: orgPos.name,
          profileId: String(profile.id),
        });
        recruitmentRequestId = pending.id;
      } catch (queueErr) {
        if (queueErr instanceof HrApiError) throw queueErr;
        throw new HrApiError(
          "Antrian persetujuan recruitment gagal dibuat. Pastikan migrate lokal Phase 35I-J sudah dijalankan, lalu coba lagi.",
          503,
          "RECRUITMENT_QUEUE_UNAVAILABLE",
        );
      }
    }

    await emitEmployeeAuditEvent(adminPb, {
      event_code: EMPLOYEE_AUDIT_EVENTS.CREATED,
      actor_id: _ctx.userId,
      target_user_id: userId,
      target_profile_id: String(profile.id),
      target_label: displayName,
      payload: {
        after_status: "inactive",
        after_role_code: preset.roleCode,
        reason: appointmentCreated
          ? `org_appointment_created:${orgPos.id}`
          : `org_appointment_pending:${orgPos.id}${recruitmentRequestId ? `:${recruitmentRequestId}` : ""}`,
        changed_fields: appointmentCreated
          ? ["org_assignment"]
          : ["org_position_target", "recruitment_request"],
      },
      severity: "success",
    });

    return {
      userId,
      profileId: String(profile.id),
      orgPositionId: orgPos.id,
      appointmentCreated,
      appointmentPending: !appointmentCreated,
      recruitmentRequestId,
    };
  } catch (e) {
    if (userId) {
      try {
        await adminPb.collection("users").delete(userId);
      } catch {
        /* rollback best-effort */
      }
    }
    if (e instanceof HrApiError) throw e;
    const msg = e instanceof Error ? e.message : "Gagal membuat karyawan.";
    throw new HrApiError(msg, 400);
  }
}
