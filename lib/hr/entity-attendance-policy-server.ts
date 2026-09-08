/**
 * Phase 34F — Entity attendance policy CRUD + staff effective policy API.
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { hasEffectiveCapability } from "@/lib/access/effective-capability";
import { assertHrModuleEntityAccess } from "@/lib/access/hr-api-enforcement";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { isCompanyInScope } from "@/lib/hr/company-scope";
import { hasHrPolicyCapability } from "@/lib/capabilities/hr-policy";
import { fetchPrimaryAdministrativeEntityForUser } from "@/lib/hr/profile-primary-entity";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import { notifyAttendancePolicyPublished } from "@/lib/notifications/hr-dispatch";
import {
  buildAbsenceExampleText,
  buildLateExampleText,
  type EntityAttendancePolicyDto,
  type StaffAttendancePolicyView,
} from "@/lib/hr/entity-attendance-policy-types";
import {
  HR_ENTITY_ATTENDANCE_POLICIES,
  mapEntityAttendancePolicyRow,
  policyToDeductionRates,
  resolveEffectiveEntityAttendancePolicy,
} from "@/lib/hr/entity-attendance-policy";

function hasEffectiveHrPolicyCapability(
  ctx: HrApiAuthContext,
  cap: "hr_policy.view_published" | "hr_policy.manage",
): boolean {
  return hasEffectiveCapability(
    ctx.user,
    ctx.accessContext,
    cap,
    hasHrPolicyCapability(ctx.user, cap),
  );
}

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function dayBefore(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().slice(0, 10);
}

async function archivePreviousPublished(
  adminPb: PocketBase,
  companyId: string,
  effectiveFrom: string,
  excludeId?: string,
): Promise<void> {
  const companyFilter = companyId
    ? `company_id = "${pbEscape(companyId)}"`
    : `(company_id = "" || company_id = null)`;
  const rows = await adminPb.collection(HR_ENTITY_ATTENDANCE_POLICIES).getFullList({
    filter: `status = "published" && effective_from < "${pbEscape(effectiveFrom)}" && ${companyFilter}`,
    sort: "-effective_from",
    requestKey: null,
  });
  const until = dayBefore(effectiveFrom);
  for (const row of rows) {
    const id = String((row as Record<string, unknown>).id);
    if (excludeId && id === excludeId) continue;
    const existingUntil = String((row as Record<string, unknown>).effective_until ?? "").slice(0, 10);
    if (existingUntil && existingUntil <= until) continue;
    await adminPb.collection(HR_ENTITY_ATTENDANCE_POLICIES).update(
      id,
      { effective_until: until },
      { requestKey: null },
    );
  }
}

export async function listManageableAttendancePolicies(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<EntityAttendancePolicyDto[]> {
  if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.manage")) {
    throw new HrApiError("Akses kelola kebijakan absensi ditolak.", 403);
  }

  let filter = "";
  const effectiveCompanies = await getHrOperationalCompanyIds(adminPb, ctx);
  if (!ctx.isOwner && effectiveCompanies.length > 0) {
    const parts = effectiveCompanies.map((id) => `company_id = "${pbEscape(id)}"`);
    parts.push(`company_id = ""`);
    filter = `(${parts.join(" || ")})`;
  }

  const rows = await adminPb.collection(HR_ENTITY_ATTENDANCE_POLICIES).getFullList({
    filter: filter || undefined,
    sort: "-effective_from,-updated",
    requestKey: null,
  });
  return rows.map((r) => mapEntityAttendancePolicyRow(r as Record<string, unknown>));
}

export async function upsertAttendancePolicy(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    id?: string;
    company_id?: string;
    effective_from?: string;
    effective_until?: string;
    late_enabled?: boolean;
    late_grace_minutes?: number;
    late_rate_per_minute?: number;
    absence_enabled?: boolean;
    absence_rate_per_day?: number;
    notes?: string;
    publish?: boolean;
  },
): Promise<EntityAttendancePolicyDto> {
  if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.manage")) {
    throw new HrApiError("Akses kelola kebijakan absensi ditolak.", 403);
  }

  const companyId = String(input.company_id ?? "").trim();
  if (companyId && !ctx.isOwner) {
    assertHrModuleEntityAccess(ctx, companyId);
  }

  const effectiveFrom = input.effective_from?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const payload: Record<string, unknown> = {
    company_id: companyId || "",
    effective_from: effectiveFrom,
    effective_until: input.effective_until?.slice(0, 10) || "",
    late_enabled: input.late_enabled !== false,
    late_grace_minutes: Math.max(0, Math.floor(Number(input.late_grace_minutes ?? 0))),
    late_rate_per_minute: Math.max(0, Math.round(Number(input.late_rate_per_minute ?? 0))),
    absence_enabled: input.absence_enabled !== false,
    absence_rate_per_day: Math.max(0, Math.round(Number(input.absence_rate_per_day ?? 0))),
    notes: input.notes?.trim() || "",
    updated_by: ctx.userId,
  };

  if (input.publish) {
    payload.status = "published";
    payload.published_by = ctx.userId;
    payload.published_at = new Date().toISOString();
    await archivePreviousPublished(adminPb, companyId, effectiveFrom, input.id?.trim());
  }

  let record: Record<string, unknown>;
  const isUpdate = Boolean(input.id?.trim());

  if (isUpdate) {
    const existing = (await adminPb.collection(HR_ENTITY_ATTENDANCE_POLICIES).getOne(input.id!, {
      requestKey: null,
    })) as Record<string, unknown>;
    const existingCompany = String(existing.company_id ?? "");
    if (existingCompany && !ctx.isOwner && !isCompanyInScope(existingCompany, await getHrOperationalCompanyIds(adminPb, ctx))) {
      throw new HrApiError("Kebijakan di luar scope entitas.", 403);
    }
    if (!input.publish) {
      payload.status = existing.status ?? "draft";
    }
    record = (await adminPb.collection(HR_ENTITY_ATTENDANCE_POLICIES).update(input.id!, payload, {
      requestKey: null,
    })) as Record<string, unknown>;
  } else {
    payload.created_by = ctx.userId;
    payload.status = input.publish ? "published" : "draft";
    record = (await adminPb.collection(HR_ENTITY_ATTENDANCE_POLICIES).create(payload, {
      requestKey: null,
    })) as Record<string, unknown>;
  }

  await emitBusinessEventServer(adminPb, {
    event_code: input.publish ? "hr_attendance_policy.published" : "hr_attendance_policy.updated",
    module: "hr",
    entity_type: "hr_entity_attendance_policy",
    entity_id: String(record.id),
    entity_label: `Kebijakan absensi ${effectiveFrom}`,
    actor_id: ctx.userId,
    severity: "info",
    payload: { company_id: companyId || undefined, effective_from: effectiveFrom },
  });

  if (input.publish) {
    await notifyAttendancePolicyPublished(adminPb, {
      policyId: String(record.id),
      companyId: companyId || undefined,
      effectiveFrom,
    });
  }

  return mapEntityAttendancePolicyRow(record);
}

function buildStaffPolicyView(
  policy: EntityAttendancePolicyDto,
  companyName: string,
): StaffAttendancePolicyView {
  const rates = policyToDeductionRates(policy);
  return {
    company_id: policy.company_id,
    company_name: companyName,
    effective_from: policy.effective_from,
    effective_until: policy.effective_until,
    updated: policy.updated,
    late_enabled: policy.late_enabled,
    late_grace_minutes: policy.late_grace_minutes,
    late_rate_per_minute: policy.late_rate_per_minute,
    late_example: buildLateExampleText(rates),
    absence_enabled: policy.absence_enabled,
    absence_rate_per_day: policy.absence_rate_per_day,
    absence_example: buildAbsenceExampleText(rates),
    approved_leave_note:
      "Cuti yang disetujui HR tidak dikenakan potongan gaji dan dihitung sebagai kehadiran sesuai kebijakan bonus.",
    sick_leave_note:
      "Sakit dengan surat dokumen yang disetujui tidak dihitung sebagai alpha; potongan tidak berlaku.",
    official_business_note:
      "Dinas/aktivitas luar kantor yang disetujui tidak dihitung alpha dan tidak dikenakan potongan ketidakhadiran.",
  };
}

export async function getEffectiveAttendancePolicyForUser(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  asOfYmd?: string,
): Promise<StaffAttendancePolicyView | null> {
  if (!hasEffectiveHrPolicyCapability(ctx, "hr_policy.view_published")) {
    throw new HrApiError("Akses kebijakan absensi ditolak.", 403);
  }

  const primary = await fetchPrimaryAdministrativeEntityForUser(adminPb, ctx.userId);
  const date = asOfYmd?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const policy = await resolveEffectiveEntityAttendancePolicy(adminPb, primary.company_id, date);
  if (!policy) return null;
  return buildStaffPolicyView(policy, primary.company_name || primary.label || "—");
}
