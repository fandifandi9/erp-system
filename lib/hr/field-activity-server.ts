/**
 * Phase 35I-M / NEXT — field activity (kerja di luar kantor).
 * Distinct from Izin/Off (hr_absence_requests).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { getHrWorkingCompanyIds } from "@/lib/access/hr-api-enforcement";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";
import { FIELD_ACTIVITY_COLLECTION } from "@/lib/field_activity";
import {
  HR_ACTION_AT_FIELD,
  HR_ACTION_BY_FIELD,
  HR_ACTION_NAME_FIELD,
} from "@/lib/leave";
import {
  assertOrgHierarchyApprover,
  canOrgHierarchyApprove,
} from "@/lib/hr/org-approval-authority";

function hrPayload(ctx: HrApiAuthContext): Record<string, string> {
  return {
    [HR_ACTION_BY_FIELD]: ctx.userId,
    [HR_ACTION_NAME_FIELD]: String(ctx.user?.name ?? ctx.user?.email ?? ctx.userId),
    [HR_ACTION_AT_FIELD]: new Date().toISOString(),
  };
}

function subjectOf(row: Record<string, unknown>): string {
  const u = row.user;
  if (typeof u === "string") return u;
  if (u && typeof u === "object" && "id" in u) return String((u as { id: string }).id ?? "");
  return "";
}

async function assertSubjectScope(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  subjectUserId: string,
): Promise<void> {
  if (ctx.isOwner) return;
  const operational = await getHrOperationalCompanyIds(adminPb, ctx);
  if (!operational.length) throw new HrApiError("Scope entitas kosong.", 403);
  const subjectCompanies = await getAccessibleCompanyIds(adminPb, subjectUserId);
  if (!subjectCompanies.some((id) => operational.includes(id))) {
    throw new HrApiError("Akses lintas entitas ditolak.", 403);
  }
}

export async function serverSubmitFieldActivity(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    start_date: string;
    end_date: string;
    activity_type?: string;
    destination?: string;
    reason?: string;
  },
) {
  const start_date = String(input.start_date ?? "").trim().slice(0, 10);
  const end_date = String(input.end_date ?? "").trim().slice(0, 10) || start_date;
  if (!start_date) return { success: false as const, message: "Tanggal wajib." };
  if (end_date < start_date) {
    return { success: false as const, message: "Tanggal selesai tidak boleh sebelum mulai." };
  }
  const dest = String(input.destination ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  if (dest.length < 2) return { success: false as const, message: "Tujuan / lokasi wajib." };
  if (reason.length < 10) {
    return { success: false as const, message: "Jelaskan keperluan aktivitas (min. 10 karakter)." };
  }

  const rec = await adminPb.collection(FIELD_ACTIVITY_COLLECTION).create({
    user: ctx.userId,
    start_date,
    end_date,
    activity_type: String(input.activity_type ?? "other"),
    destination: dest,
    reason,
    status: "pending_hr",
  });
  return { success: true as const, message: "Pengajuan terkirim.", id: String(rec.id) };
}

export async function serverApproveFieldActivity(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  id: string,
) {
  const row = (await adminPb.collection(FIELD_ACTIVITY_COLLECTION).getOne(id)) as Record<
    string,
    unknown
  >;
  const subject = subjectOf(row);
  await assertOrgHierarchyApprover(adminPb, ctx, subject, {
    selfApproveCode: "FIELD_SELF_APPROVE",
    orgAuthorityCode: "FIELD_ORG_AUTHORITY_REQUIRED",
    allowHrAdminFallback: true,
  });
  await assertSubjectScope(adminPb, ctx, subject);
  if (String(row.status) !== "pending_hr" && String(row.status) !== "pending") {
    return { success: false as const, message: "Status tidak valid." };
  }
  await adminPb.collection(FIELD_ACTIVITY_COLLECTION).update(id, {
    status: "approved",
    ...hrPayload(ctx),
  });
  return { success: true as const, message: "Disetujui.", id };
}

export async function serverRejectFieldActivity(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  id: string,
  reason: string,
) {
  const why = String(reason ?? "").trim();
  if (why.length < 3) return { success: false as const, message: "Alasan wajib." };
  const row = (await adminPb.collection(FIELD_ACTIVITY_COLLECTION).getOne(id)) as Record<
    string,
    unknown
  >;
  const subject = subjectOf(row);
  await assertOrgHierarchyApprover(adminPb, ctx, subject, {
    selfApproveCode: "FIELD_SELF_APPROVE",
    orgAuthorityCode: "FIELD_ORG_AUTHORITY_REQUIRED",
    allowHrAdminFallback: true,
  });
  await assertSubjectScope(adminPb, ctx, subject);
  await adminPb.collection(FIELD_ACTIVITY_COLLECTION).update(id, {
    status: "rejected",
    rejection_reason: why,
    ...hrPayload(ctx),
  });
  return { success: true as const, message: "Ditolak.", id };
}

export async function serverCancelFieldActivity(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  id: string,
) {
  const row = (await adminPb.collection(FIELD_ACTIVITY_COLLECTION).getOne(id)) as Record<
    string,
    unknown
  >;
  if (subjectOf(row) !== ctx.userId) {
    throw new HrApiError("Hanya pengaju yang dapat membatalkan.", 403);
  }
  if (String(row.status) !== "pending_hr" && String(row.status) !== "pending") {
    return { success: false as const, message: "Hanya pending yang dapat dibatalkan." };
  }
  await adminPb.collection(FIELD_ACTIVITY_COLLECTION).update(id, { status: "cancelled" });
  return { success: true as const, message: "Dibatalkan.", id };
}

export async function serverListPendingFieldActivityForApprover(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<Record<string, unknown>[]> {
  const rows = await adminPb.collection(FIELD_ACTIVITY_COLLECTION).getFullList({
    filter: 'status="pending_hr" || status="pending"',
    sort: "-created",
    expand: "user",
    requestKey: null,
  });
  const out: Record<string, unknown>[] = [];
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const subject = subjectOf(r);
    if (!subject) continue;
    if (
      await canOrgHierarchyApprove(adminPb, ctx, subject, {
        selfApproveCode: "FIELD_SELF_APPROVE",
        orgAuthorityCode: "FIELD_ORG_AUTHORITY_REQUIRED",
        allowHrAdminFallback: true,
      })
    ) {
      out.push(r);
    }
  }
  return out;
}
