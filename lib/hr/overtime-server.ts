/**
 * Phase 35I-M — Overtime mutations via admin PB (client write-locked).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import {
  HR_ACTION_AT_FIELD,
  HR_ACTION_BY_FIELD,
  HR_ACTION_NAME_FIELD,
} from "@/lib/leave";
import {
  assertOrgHierarchyApprover,
  canOrgHierarchyApprove,
} from "@/lib/hr/org-approval-authority";

const COLLECTION = "overtime_requests";

async function assertOtSubjectInScope(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  subjectUserId: string,
): Promise<void> {
  if (ctx.isOwner) return;
  const operational = await getHrOperationalCompanyIds(adminPb, ctx);
  if (operational.length === 0) throw new HrApiError("Scope entitas HR kosong.", 403);
  const subjectCompanies = await getAccessibleCompanyIds(adminPb, subjectUserId);
  if (!subjectCompanies.some((id) => operational.includes(id))) {
    throw new HrApiError("Akses lintas entitas ditolak.", 403);
  }
}

function hrPayload(ctx: HrApiAuthContext): Record<string, string> {
  return {
    [HR_ACTION_BY_FIELD]: ctx.userId,
    [HR_ACTION_NAME_FIELD]: String(ctx.user?.name ?? ctx.user?.email ?? ctx.userId),
    [HR_ACTION_AT_FIELD]: new Date().toISOString(),
  };
}

export type OvertimeMutationResult = {
  success: boolean;
  message: string;
  id?: string;
};

export async function serverSubmitOvertimeStaff(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    work_date: string;
    start_time: string;
    end_time: string;
    hours: number;
    reason?: string;
  },
): Promise<OvertimeMutationResult> {
  const work_date = String(input.work_date ?? "").trim();
  const start_time = String(input.start_time ?? "").trim();
  const end_time = String(input.end_time ?? "").trim();
  const hours = Number(input.hours);
  if (!work_date || !start_time || !end_time || !Number.isFinite(hours) || hours <= 0) {
    return { success: false, message: "Data lembur tidak lengkap." };
  }

  const rec = await adminPb.collection(COLLECTION).create({
    user: ctx.userId,
    work_date,
    start_time,
    end_time,
    hours,
    source: "staff_request",
    status: "waiting_hr",
    reason: String(input.reason ?? "").trim() || "Pengajuan lembur",
    created_by: ctx.userId,
  });

  return { success: true, message: "Pengajuan lembur terkirim.", id: String(rec.id) };
}

export async function serverApproveOvertime(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  requestId: string,
): Promise<OvertimeMutationResult> {
  const row = (await adminPb.collection(COLLECTION).getOne(requestId)) as Record<string, unknown>;
  const subject = String(row.user ?? "");
  await assertOtSubjectInScope(adminPb, ctx, subject);
  await assertOrgHierarchyApprover(adminPb, ctx, subject, {
    selfApproveCode: "OT_SELF_APPROVE",
    orgAuthorityCode: "OT_ORG_AUTHORITY_REQUIRED",
    allowHrAdminFallback: true,
  });

  const status = String(row.status ?? "");
  if (status !== "waiting_hr" && status !== "pending") {
    return { success: false, message: "Status lembur tidak dapat disetujui." };
  }

  await adminPb.collection(COLLECTION).update(requestId, {
    status: "hr_approved",
    ...hrPayload(ctx),
  });
  return { success: true, message: "Lembur disetujui.", id: requestId };
}

export async function serverRejectOvertime(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  requestId: string,
  reason: string,
): Promise<OvertimeMutationResult> {
  const why = String(reason ?? "").trim();
  if (why.length < 3) return { success: false, message: "Alasan penolakan wajib." };

  const row = (await adminPb.collection(COLLECTION).getOne(requestId)) as Record<string, unknown>;
  const subject = String(row.user ?? "");
  await assertOtSubjectInScope(adminPb, ctx, subject);
  await assertOrgHierarchyApprover(adminPb, ctx, subject, {
    selfApproveCode: "OT_SELF_APPROVE",
    orgAuthorityCode: "OT_ORG_AUTHORITY_REQUIRED",
    allowHrAdminFallback: true,
  });

  await adminPb.collection(COLLECTION).update(requestId, {
    status: "hr_rejected",
    rejection_reason: why,
    ...hrPayload(ctx),
  });
  return { success: true, message: "Lembur ditolak.", id: requestId };
}

/** Scoped OT monitor — all statuses within FOM ops (Desktop HR). */
export async function serverListOvertimeForHrScope(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<Record<string, unknown>[]> {
  const operational = await getHrOperationalCompanyIds(adminPb, ctx);
  if (!ctx.isOwner && operational.length === 0) return [];

  const rows = await adminPb.collection(COLLECTION).getFullList({
    sort: "-created",
    expand: "user",
    requestKey: null,
  });

  if (ctx.isOwner) return rows as unknown as Record<string, unknown>[];

  const out: Record<string, unknown>[] = [];
  for (const raw of rows) {
    const uid = String((raw as { user?: string }).user ?? "");
    if (!uid) continue;
    try {
      await assertOtSubjectInScope(adminPb, ctx, uid);
      out.push(raw as unknown as Record<string, unknown>);
    } catch {
      /* out of scope */
    }
  }
  return out;
}

export async function serverListPendingOvertimeForHr(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<Record<string, unknown>[]> {
  const operational = await getHrOperationalCompanyIds(adminPb, ctx);
  if (!ctx.isOwner && operational.length === 0) return [];

  const rows = await adminPb.collection(COLLECTION).getFullList({
    filter: `status = "waiting_hr" || status = "pending"`,
    sort: "-created",
    expand: "user",
    requestKey: null,
  });

  if (ctx.isOwner) return rows as unknown as Record<string, unknown>[];

  const out: Record<string, unknown>[] = [];
  for (const raw of rows) {
    const uid = String((raw as { user?: string }).user ?? "");
    if (!uid) continue;
    try {
      await assertOtSubjectInScope(adminPb, ctx, uid);
      if (
        await canOrgHierarchyApprove(adminPb, ctx, uid, {
          selfApproveCode: "OT_SELF_APPROVE",
          orgAuthorityCode: "OT_ORG_AUTHORITY_REQUIRED",
          allowHrAdminFallback: true,
        })
      ) {
        out.push(raw as unknown as Record<string, unknown>);
      }
    } catch {
      /* out of scope */
    }
  }
  return out;
}
