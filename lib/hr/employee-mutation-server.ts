/**
 * lib/hr/employee-mutation-server.ts
 * Phase 31 — Server-authoritative employee/profile mutations.
 */

import {
  assertCanManageTargetAccount,
  assertEmployeeCapability,
  assertEmployeeTargetAccess,
  hasEffectiveEmployeeCapability,
  stripSensitiveFields,
} from "@/lib/hr/employee-auth";
import {
  detectSensitiveFieldChanges,
  emitEmployeeAuditEvent,
  EMPLOYEE_AUDIT_EVENTS,
} from "@/lib/hr/employee-audit";
import {
  buildEmployeeProfilePayload,
  validateEmployeeProfileForm,
  type EmployeeProfileFormInput,
} from "@/lib/hr/employee-profile-payload";
import { PROFILE_MANAGER_FIELD } from "@/lib/hr/employee-scope";
import { assertNoCircularManagerAssignment } from "@/lib/hr/manager-hierarchy";
import {
  employeeRolePresetById,
  HR_ROLE_PRESET_FIELD,
  type EmployeeRolePresetId,
} from "@/lib/hr/employee-role-presets";
import { normalizeAuthModel } from "@/lib/auth-model";
import {
  assignEmployeeMembership,
  listEmployeeMemberships,
} from "@/lib/master-data/membership";
import { assertMasterDataCapability } from "@/lib/master-data/master-data-auth";
import { isHrOperationalActor } from "@/lib/access/hr-api-enforcement";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import type PocketBase from "pocketbase";

export type UpdateEmployeeInput = EmployeeProfileFormInput & {
  manager_user_id?: string | null;
  /** Phase 35I-D — link to hr_org_positions; drives derived atasan. */
  org_position_id?: string | null;
  role_preset_id?: string;
  dashboard_access?: boolean;
  primary_entity_id?: string;
};

async function loadTargetContext(
  adminPb: PocketBase,
  userId: string,
): Promise<{
  user: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  profileId: string | null;
  managerUserId: string | null;
}> {
  let user: Record<string, unknown>;
  try {
    user = (await adminPb.collection("users").getOne(userId)) as Record<string, unknown>;
  } catch {
    throw new HrApiError("Karyawan tidak ditemukan.", 404);
  }

  let profile: Record<string, unknown> | null = null;
  let profileId: string | null = null;
  let managerUserId: string | null = null;

  try {
    const rows = await adminPb.collection("profiles").getFullList({
      filter: `user = "${userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
      sort: "-updated",
    });
    if (rows.length > 0) {
      profile = rows[0] as Record<string, unknown>;
      profileId = String(profile.id);
      const mgr = profile[PROFILE_MANAGER_FIELD];
      if (typeof mgr === "string" && mgr) managerUserId = mgr;
      else if (mgr && typeof mgr === "object" && "id" in mgr) {
        managerUserId = String((mgr as { id: string }).id);
      }
    }
  } catch {
    /* optional */
  }

  return { user, profile, profileId, managerUserId };
}

export async function serverUpdateEmployeeByHr(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  userId: string,
  input: UpdateEmployeeInput,
): Promise<{ userId: string; profileId: string | null }> {
  if (!isHrOperationalActor(ctx)) {
    throw new HrApiError("Akses HR ditolak.", 403);
  }
  assertEmployeeCapability(ctx, "employee.update");
  const targetCtx = await loadTargetContext(adminPb, userId);
  await assertEmployeeTargetAccess(adminPb, ctx, "employee.update", {
    userId,
    profileId: targetCtx.profileId || undefined,
    managerUserId: targetCtx.managerUserId,
    targetUser: targetCtx.user,
  });
  assertCanManageTargetAccount(ctx, targetCtx.user, "update");

  const profileErr = validateEmployeeProfileForm(input);
  if (profileErr) {
    throw new HrApiError("Data profil tidak valid.", 400);
  }

  const canViewSensitive = hasEffectiveEmployeeCapability(ctx, "employee.view_sensitive");
  const beforeProfile = { ...(targetCtx.profile || {}) };

  const profilePayload = buildEmployeeProfilePayload({
    ...input,
    name: input.name?.trim() || String(targetCtx.user.name || ""),
    email: input.email?.trim() || String(targetCtx.user.email || ""),
  });

  if (!canViewSensitive) {
    for (const key of [
      "nik",
      "npwp",
      "salary",
      "leave_daily_rate",
      "extra_bonus_amount",
      "extra_bonus_enabled",
      "late_deduction_rupiah_per_minute",
      "absence_deduction_rupiah_per_day",
    ]) {
      delete profilePayload[key];
    }
  }

  if (input.org_position_id !== undefined) {
    if (ctx.userId === userId) {
      throw new HrApiError("Tidak dapat mengubah jabatan organisasi milik sendiri.", 403);
    }
    const nextPosId = String(input.org_position_id ?? "").trim() || null;
    profilePayload.org_position_id = nextPosId || "";
    if (nextPosId) {
      const { serverGetOrgPosition, deriveSuperiorFromPosition } = await import(
        "@/lib/hr/org-position-server"
      );
      const { createOrgAssignment, listActiveOrgAssignments, endOrgAssignment } = await import(
        "@/lib/hr/org-assignment-server"
      );
      const { canAssignPositionHolder } = await import("@/lib/hr/org-authority");
      const { getHrOperationalCompanyIds } = await import(
        "@/lib/org/resolve-hr-operational-company-scope"
      );
      const pos = await serverGetOrgPosition(adminPb, nextPosId);
      if (!pos || !pos.isActive) {
        throw new HrApiError("Jabatan organisasi tidak valid atau nonaktif.", 400);
      }
      const parent = pos.parentPositionId
        ? await serverGetOrgPosition(adminPb, pos.parentPositionId)
        : null;
      if (!canAssignPositionHolder(ctx, pos, parent)) {
        throw new HrApiError(
          "Anda tidak berwenang menetapkan jabatan organisasi ini (perlu otoritas hierarki, bukan hanya akses HR).",
          403,
        );
      }
      const ops = await getHrOperationalCompanyIds(adminPb, ctx);
      if (!ctx.isOwner && ops.length > 0 && !ops.includes(pos.companyId)) {
        throw new HrApiError("Jabatan di luar cakupan operasional HR Anda.", 403);
      }
      const companyId = pos.companyId;
      // 35I-G: end any active placement before creating the new one (one active only)
      const existingActives = await listActiveOrgAssignments(adminPb, userId);
      for (const a of existingActives) {
        await endOrgAssignment(adminPb, ctx, a.id);
      }
      try {
        await createOrgAssignment(adminPb, ctx, {
          userId,
          companyId,
          orgPositionId: nextPosId,
        });
      } catch (e) {
        // If already holder of this position via another path, still mirror profile
        if (!(e instanceof HrApiError && e.status === 409)) throw e;
      }
      profilePayload.position = pos.name;
      const superior = await deriveSuperiorFromPosition(adminPb, nextPosId);
      profilePayload[PROFILE_MANAGER_FIELD] = superior.superiorUserId || null;
    }
    // When clearing org position, do not auto-clear legacy manager unless explicitly sent.
  }

  if (input.manager_user_id !== undefined) {
    if (ctx.userId === userId) {
      throw new HrApiError("Tidak dapat mengubah atasan langsung milik sendiri.", 403);
    }
    const existingOrgPos = String(
      input.org_position_id !== undefined
        ? input.org_position_id || ""
        : targetCtx.profile?.org_position_id || "",
    ).trim();
    if (existingOrgPos) {
      throw new HrApiError(
        "Atasan langsung diturunkan dari jabatan organisasi. Ubah Parent Position / pemegang jabatan induk, bukan picker atasan.",
        400,
      );
    }
    if (!hasEffectiveEmployeeCapability(ctx, "employee.assign_manager")) {
      throw new HrApiError("Anda tidak berwenang menetapkan atasan.", 403);
    }
    const mgr = input.manager_user_id;
    if (mgr && mgr === userId) {
      throw new HrApiError("Karyawan tidak dapat menjadi atasan dirinya sendiri.", 400);
    }
    await assertNoCircularManagerAssignment(adminPb, userId, mgr);
    profilePayload[PROFILE_MANAGER_FIELD] = mgr || null;
  }

  const displayName = String(input.name || targetCtx.user.name || "").trim();
  if (displayName) {
    await adminPb.collection("users").update(userId, { name: displayName });
  }

  let profileId = targetCtx.profileId;
  if (profileId) {
    await adminPb.collection("profiles").update(profileId, profilePayload);
  } else {
    const created = await adminPb.collection("profiles").create({
      user: userId,
      ...profilePayload,
    });
    profileId = String(created.id);
  }

  if (input.primary_entity_id !== undefined && input.primary_entity_id.trim()) {
    assertMasterDataCapability(ctx, "master_data.membership.assign");
    await assignEmployeeMembership(
      adminPb,
      ctx,
      userId,
      { primaryEntityId: input.primary_entity_id.trim() },
      displayName,
    );
  }

  let roleChanged = false;
  let accessChanged = false;
  if (input.role_preset_id) {
    if (!hasEffectiveEmployeeCapability(ctx, "employee.manage_accounts")) {
      throw new HrApiError("Anda tidak berwenang mengubah role karyawan.", 403);
    }
    const preset = employeeRolePresetById(String(input.role_preset_id).trim());
    if (!preset) throw new HrApiError("Preset role tidak valid.", 400);

    const beforeRole = normalizeAuthModel(targetCtx.user).roleCode;
    await adminPb.collection("users").update(userId, {
      role_code: preset.roleCode,
      role: preset.roleCode,
      inventory_role: preset.inventoryRole,
      [HR_ROLE_PRESET_FIELD]: preset.id as EmployeeRolePresetId,
      ...(typeof input.dashboard_access === "boolean"
        ? { dashboard_access: input.dashboard_access }
        : {}),
    });
    roleChanged = beforeRole !== preset.roleCode;
  } else if (typeof input.dashboard_access === "boolean") {
    if (!hasEffectiveEmployeeCapability(ctx, "employee.manage_accounts")) {
      throw new HrApiError("Anda tidak berwenang mengubah akses dashboard.", 403);
    }
    const beforeDash = Boolean(targetCtx.user.dashboard_access);
    if (beforeDash !== input.dashboard_access) {
      await adminPb.collection("users").update(userId, {
        dashboard_access: input.dashboard_access,
      });
      accessChanged = true;
      await emitEmployeeAuditEvent(adminPb, {
        event_code: EMPLOYEE_AUDIT_EVENTS.ACCESS_CHANGED,
        actor_id: ctx.userId,
        target_user_id: userId,
        target_profile_id: profileId!,
        target_label: displayName,
        payload: {
          changed_fields: ["dashboard_access"],
          before_status: beforeDash ? "true" : "false",
          after_status: input.dashboard_access ? "true" : "false",
        },
      });
    }
  }

  const afterProfile = (await adminPb.collection("profiles").getOne(profileId!)) as Record<
    string,
    unknown
  >;

  const sensitiveChanged = detectSensitiveFieldChanges(beforeProfile, afterProfile);
  if (sensitiveChanged.length > 0) {
    await emitEmployeeAuditEvent(adminPb, {
      event_code: EMPLOYEE_AUDIT_EVENTS.SENSITIVE_DATA_CHANGED,
      actor_id: ctx.userId,
      target_user_id: userId,
      target_profile_id: profileId!,
      target_label: displayName,
      payload: { changed_fields: sensitiveChanged },
      severity: "warning",
    });
  }

  if (input.manager_user_id !== undefined) {
    const beforeMgr = targetCtx.managerUserId;
    const afterMgr = input.manager_user_id || null;
    if (beforeMgr !== afterMgr) {
      await emitEmployeeAuditEvent(adminPb, {
        event_code: EMPLOYEE_AUDIT_EVENTS.MANAGER_CHANGED,
        actor_id: ctx.userId,
        target_user_id: userId,
        target_profile_id: profileId!,
        target_label: displayName,
        payload: {
          before_manager_id: beforeMgr,
          after_manager_id: afterMgr,
        },
      });
    }
  }

  if (roleChanged) {
    await emitEmployeeAuditEvent(adminPb, {
      event_code: EMPLOYEE_AUDIT_EVENTS.ROLE_CHANGED,
      actor_id: ctx.userId,
      target_user_id: userId,
      target_profile_id: profileId!,
      target_label: displayName,
      payload: {
        before_role_code: String(targetCtx.user.role_code || ""),
        after_role_code: String(
          employeeRolePresetById(String(input.role_preset_id))?.roleCode || "",
        ),
      },
    });
  }

  await emitEmployeeAuditEvent(adminPb, {
    event_code: EMPLOYEE_AUDIT_EVENTS.UPDATED,
    actor_id: ctx.userId,
    target_user_id: userId,
    target_profile_id: profileId!,
    target_label: displayName,
  });

  return { userId, profileId };
}

export async function serverSetEmployeeStatus(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  userId: string,
  status: "active" | "inactive",
  reason?: string,
): Promise<void> {
  const cap = status === "active" ? "employee.activate" : "employee.deactivate";
  assertEmployeeCapability(ctx, cap);

  const targetCtx = await loadTargetContext(adminPb, userId);
  await assertEmployeeTargetAccess(adminPb, ctx, "employee.view", {
    userId,
    profileId: targetCtx.profileId || undefined,
    managerUserId: targetCtx.managerUserId,
    targetUser: targetCtx.user,
  });
  assertCanManageTargetAccount(
    ctx,
    targetCtx.user,
    status === "active" ? "activate" : "deactivate",
  );

  const beforeStatus = String(targetCtx.user.status || "inactive");
  if (beforeStatus === status) return;

  await adminPb.collection("users").update(userId, { status });

  await emitEmployeeAuditEvent(adminPb, {
    event_code:
      status === "active"
        ? EMPLOYEE_AUDIT_EVENTS.ACTIVATED
        : EMPLOYEE_AUDIT_EVENTS.DEACTIVATED,
    actor_id: ctx.userId,
    target_user_id: userId,
    target_profile_id: targetCtx.profileId || undefined,
    target_label: String(targetCtx.user.name || targetCtx.user.email || userId),
    payload: {
      before_status: beforeStatus,
      after_status: status,
      reason: reason?.trim() || undefined,
    },
    severity: status === "active" ? "success" : "warning",
  });
}

export type AccessPreviewResult = {
  user: {
    id: string;
    name: string;
    email: string;
    role_code: string | null;
    account_type: string;
    status: string;
    dashboard_access: boolean;
  };
  legal_entity: {
    memberships: Array<{
      company_id: string;
      name: string;
      code?: string;
      entity_type?: string;
      is_primary: boolean;
    }>;
    primary_entity_id: string | null;
  };
  organization: {
    position?: string;
    division?: string;
    department?: string;
    manager_user_id?: string | null;
    manager_name?: string | null;
  };
  work: {
    office_id?: string | null;
    office_name?: string | null;
  };
  profile: {
    position?: string;
    division?: string;
    department?: string;
    manager_user_id?: string | null;
    manager_name?: string | null;
  };
  company_scope: {
    actor_company_ids: string[];
    label: string;
  };
  capabilities: {
    mobile: string[];
    employee: string[];
    approval: string[];
  };
  sensitive_data_access: boolean;
  scopes: Array<{ capability: string; scope: string }>;
  mobile_access: Array<{ label: string; enabled: boolean }>;
  restricted: string[];
};

export async function buildEmployeeAccessPreview(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId: string,
): Promise<AccessPreviewResult> {
  assertEmployeeCapability(ctx, "employee.view");
  const targetCtx = await loadTargetContext(adminPb, targetUserId);
  await assertEmployeeTargetAccess(adminPb, ctx, "employee.view", {
    userId: targetUserId,
    profileId: targetCtx.profileId || undefined,
    managerUserId: targetCtx.managerUserId,
    targetUser: targetCtx.user,
  });

  const { resolveEmployeeCapabilities, getEmployeeCapabilityScope } = await import(
    "@/lib/capabilities/employee"
  );
  const { listMobileCapabilitiesServer } = await import("@/lib/capabilities/mobile-resolve");

  const employeeCaps = [...resolveEmployeeCapabilities(targetCtx.user)];
  const mobileCaps = listMobileCapabilitiesServer(targetCtx.user);

  const scopes = employeeCaps.map((c) => ({
    capability: c,
    scope: getEmployeeCapabilityScope(targetCtx.user, c) || "OWN",
  }));

  let managerName: string | null = null;
  if (targetCtx.managerUserId) {
    try {
      const mgr = await adminPb.collection("users").getOne(targetCtx.managerUserId, {
        fields: "name,email",
      });
      managerName = String((mgr as { name?: string }).name || (mgr as { email?: string }).email || "");
    } catch {
      managerName = null;
    }
  }

  const auth = normalizeAuthModel(targetCtx.user);
  const approvalCaps = mobileCaps.filter((c) =>
    ["leave.approve", "overtime.approve", "field_activity.approve", "report.review"].includes(c),
  );

  const mobileAccess = [
    { label: "Absensi", enabled: mobileCaps.includes("attendance.view") },
    { label: "Cuti", enabled: mobileCaps.includes("leave.view_own") },
    { label: "Lembur", enabled: mobileCaps.includes("overtime.view_own") },
    { label: "Notifikasi", enabled: true },
    { label: "Profil", enabled: mobileCaps.includes("profile.view_own") },
    { label: "Antrean HR", enabled: mobileCaps.includes("hr.queue.leave") },
    { label: "Tim saya", enabled: employeeCaps.includes("employee.view_team") },
  ];

  const restricted: string[] = [];
  if (!employeeCaps.includes("employee.view_sensitive")) {
    restricted.push("Data sensitif (NIK, NPWP, gaji)");
  }
  if (!employeeCaps.includes("employee.create")) restricted.push("Buat karyawan");
  if (!employeeCaps.includes("employee.activate")) restricted.push("Aktivasi akun");
  if (!mobileCaps.includes("leave.approve")) restricted.push("Persetujuan cuti");
  if (!mobileCaps.includes("rating.manage")) restricted.push("Kelola rating");

  const canViewSensitive = employeeCaps.includes("employee.view_sensitive");

  const companyLabel =
    ctx.companyIds.length > 0
      ? `${ctx.companyIds.length} perusahaan dalam scope aktor`
      : "Scope perusahaan: default / tidak terbatas (Owner)";

  const profileSanitized = stripSensitiveFields(targetCtx.profile || {}, canViewSensitive);

  const membershipRows = await listEmployeeMemberships(adminPb, targetUserId);
  const legalMemberships = membershipRows.map((row) => {
    const c = row.expand?.company;
    return {
      company_id: row.company,
      name: String(c?.company_name || c?.code || row.company),
      code: c?.code,
      entity_type: c?.entity_type,
      is_primary: row.is_primary === true,
    };
  });
  const primaryEntityId =
    legalMemberships.find((m) => m.is_primary)?.company_id ||
    (legalMemberships.length === 1 ? legalMemberships[0]!.company_id : null);

  let officeName: string | null = null;
  const officeId = profileSanitized.office_id
    ? String(profileSanitized.office_id)
    : null;
  if (officeId) {
    try {
      const office = await adminPb.collection("offices").getOne(officeId, { fields: "name" });
      officeName = String((office as { name?: string }).name || "");
    } catch {
      officeName = null;
    }
  }

  return {
    user: {
      id: targetUserId,
      name: String(targetCtx.user.name || ""),
      email: String(targetCtx.user.email || ""),
      role_code: auth.roleCode,
      account_type: auth.accountType,
      status: String(targetCtx.user.status || "inactive"),
      dashboard_access: auth.dashboardAccess,
    },
    legal_entity: {
      memberships: legalMemberships,
      primary_entity_id: primaryEntityId,
    },
    organization: {
      position: String(profileSanitized.position || ""),
      division: String(profileSanitized.division || ""),
      department: String(profileSanitized.department || ""),
      manager_user_id: targetCtx.managerUserId,
      manager_name: managerName,
    },
    work: {
      office_id: officeId,
      office_name: officeName,
    },
    profile: {
      position: String(profileSanitized.position || ""),
      division: String(profileSanitized.division || ""),
      department: String(profileSanitized.department || ""),
      manager_user_id: targetCtx.managerUserId,
      manager_name: managerName,
    },
    company_scope: {
      actor_company_ids: ctx.companyIds,
      label: companyLabel,
    },
    capabilities: {
      mobile: mobileCaps,
      employee: employeeCaps,
      approval: approvalCaps,
    },
    sensitive_data_access: canViewSensitive,
    scopes,
    mobile_access: mobileAccess,
    restricted,
  };
}
