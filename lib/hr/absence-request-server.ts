/**
 * Phase NEXT — Izin / Off workflow (separate from field_activity).
 * Field activity = work outside office. Izin/Off = absence / leave-from-work request.
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import {
  HR_ACTION_AT_FIELD,
  HR_ACTION_BY_FIELD,
  HR_ACTION_NAME_FIELD,
} from "@/lib/leave";
import {
  assertOrgHierarchyApprover,
  canOrgHierarchyApprove,
} from "@/lib/hr/org-approval-authority";
import { getBusinessDateYmd } from "@/lib/hr/business-date";

export const ABSENCE_REQUESTS_COLLECTION = "hr_absence_requests";

export type AbsenceRequestType = "izin" | "off";
export type AbsenceRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function ymd(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : "";
}

function hrPayload(ctx: HrApiAuthContext): Record<string, string> {
  return {
    [HR_ACTION_BY_FIELD]: ctx.userId,
    [HR_ACTION_NAME_FIELD]: String(ctx.user?.name ?? ctx.user?.email ?? ctx.userId),
    [HR_ACTION_AT_FIELD]: new Date().toISOString(),
  };
}

function subjectUserId(raw: Record<string, unknown>): string {
  const u = raw.user;
  if (typeof u === "string") return u;
  if (u && typeof u === "object" && "id" in u) return String((u as { id: string }).id ?? "");
  return "";
}

export type AbsenceMutationResult = {
  success: boolean;
  message: string;
  id?: string;
  data?: Record<string, unknown>;
};

export async function serverSubmitAbsenceRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    type?: string;
    start_date?: string;
    end_date?: string;
    reason?: string;
  },
): Promise<AbsenceMutationResult> {
  const typeRaw = String(input.type ?? "izin").trim().toLowerCase();
  const type: AbsenceRequestType = typeRaw === "off" ? "off" : "izin";
  const start_date = ymd(input.start_date);
  const end_date = ymd(input.end_date) || start_date;
  const reason = String(input.reason ?? "").trim();

  if (!start_date) return { success: false, message: "Tanggal mulai wajib." };
  if (end_date < start_date) {
    return { success: false, message: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  }
  if (reason.length < 5) {
    return { success: false, message: "Alasan minimal 5 karakter." };
  }

  const today = getBusinessDateYmd(new Date());
  if (end_date < today) {
    return { success: false, message: "Periode tidak boleh seluruhnya di masa lalu." };
  }

  // Overlap with own pending/approved
  try {
    const existing = await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).getFullList({
      filter: `user="${pbEscape(ctx.userId)}" && (status="pending" || status="approved")`,
      requestKey: null,
    });
    for (const raw of existing) {
      const r = raw as Record<string, unknown>;
      const s = ymd(r.start_date);
      const e = ymd(r.end_date) || s;
      if (s && e && start_date <= e && s <= end_date) {
        return {
          success: false,
          message: "Sudah ada pengajuan Off overlapping (pending/approved).",
        };
      }
    }
  } catch {
    /* collection may be empty */
  }

  const companyId =
    Array.isArray(ctx.companyIds) && ctx.companyIds.length > 0 ? ctx.companyIds[0] : "";

  const payload: Record<string, unknown> = {
    user: ctx.userId,
    type,
    start_date,
    end_date,
    reason,
    status: "pending",
  };
  if (companyId) payload.company = companyId;

  try {
    const rec = await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).create(payload);
    return {
      success: true,
      message: "Pengajuan Off terkirim.",
      id: String(rec.id),
      data: rec as unknown as Record<string, unknown>,
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Gagal menyimpan pengajuan.",
    };
  }
}

export async function serverApproveAbsenceRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  id: string,
): Promise<AbsenceMutationResult> {
  const row = (await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).getOne(id)) as Record<
    string,
    unknown
  >;
  const subject = subjectUserId(row);
  await assertOrgHierarchyApprover(adminPb, ctx, subject, {
    selfApproveCode: "ABSENCE_SELF_APPROVE",
    orgAuthorityCode: "ABSENCE_ORG_AUTHORITY_REQUIRED",
    allowHrAdminFallback: true,
  });
  if (String(row.status) !== "pending") {
    return { success: false, message: "Hanya pengajuan pending yang dapat disetujui." };
  }
  await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).update(id, {
    status: "approved",
    ...hrPayload(ctx),
  });
  return { success: true, message: "Off disetujui.", id };
}

export async function serverRejectAbsenceRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  id: string,
  reason: string,
): Promise<AbsenceMutationResult> {
  const why = String(reason ?? "").trim();
  if (why.length < 3) return { success: false, message: "Alasan penolakan wajib." };
  const row = (await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).getOne(id)) as Record<
    string,
    unknown
  >;
  const subject = subjectUserId(row);
  await assertOrgHierarchyApprover(adminPb, ctx, subject, {
    selfApproveCode: "ABSENCE_SELF_APPROVE",
    orgAuthorityCode: "ABSENCE_ORG_AUTHORITY_REQUIRED",
    allowHrAdminFallback: true,
  });
  if (String(row.status) !== "pending") {
    return { success: false, message: "Hanya pengajuan pending yang dapat ditolak." };
  }
  await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).update(id, {
    status: "rejected",
    rejection_reason: why,
    ...hrPayload(ctx),
  });
  return { success: true, message: "Off ditolak.", id };
}

export async function serverCancelAbsenceRequest(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  id: string,
): Promise<AbsenceMutationResult> {
  const row = (await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).getOne(id)) as Record<
    string,
    unknown
  >;
  if (subjectUserId(row) !== ctx.userId) {
    throw new HrApiError("Hanya pengaju yang dapat membatalkan.", 403);
  }
  if (String(row.status) !== "pending") {
    return { success: false, message: "Hanya pengajuan pending yang dapat dibatalkan." };
  }
  await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).update(id, { status: "cancelled" });
  return { success: true, message: "Pengajuan dibatalkan.", id };
}

export async function serverListOwnAbsenceRequests(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<Record<string, unknown>[]> {
  try {
    return (await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).getFullList({
      filter: `user="${pbEscape(ctx.userId)}"`,
      sort: "-created",
      requestKey: null,
    })) as unknown as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export async function serverListPendingAbsenceForApprover(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<Record<string, unknown>[]> {
  let rows: Record<string, unknown>[] = [];
  try {
    rows = (await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).getFullList({
      filter: 'status="pending"',
      sort: "-created",
      expand: "user",
      requestKey: null,
    })) as unknown as Record<string, unknown>[];
  } catch {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const subject = subjectUserId(r);
    if (!subject) continue;
    if (
      await canOrgHierarchyApprove(adminPb, ctx, subject, {
        selfApproveCode: "ABSENCE_SELF_APPROVE",
        orgAuthorityCode: "ABSENCE_ORG_AUTHORITY_REQUIRED",
        allowHrAdminFallback: true,
      })
    ) {
      out.push(r);
    }
  }
  return out;
}

export async function serverListAbsenceForHr(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  statusFilter?: string,
): Promise<Record<string, unknown>[]> {
  const pending = await serverListPendingAbsenceForApprover(adminPb, ctx);
  if (!statusFilter || statusFilter === "pending") return pending;

  // History: own-company scoped via org gate on each row (approved/rejected)
  let rows: Record<string, unknown>[] = [];
  try {
    const st = pbEscape(statusFilter);
    rows = (await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).getFullList({
      filter: `status="${st}"`,
      sort: "-created",
      expand: "user",
      requestKey: null,
    })) as unknown as Record<string, unknown>[];
  } catch {
    return [];
  }
  if (ctx.isOwner) return rows;
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const subject = subjectUserId(r);
    if (
      await canOrgHierarchyApprove(adminPb, ctx, subject, {
        allowHrAdminFallback: true,
      })
    ) {
      out.push(r);
    }
  }
  return out;
}

/** Approved Izin/Off covering business date — blocks attendance check-in like leave. */
export async function hasApprovedAbsenceOnDate(
  adminPb: PocketBase,
  userId: string,
  ymdDate: string,
): Promise<boolean> {
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(ymdDate)) return false;
  try {
    const list = await adminPb.collection(ABSENCE_REQUESTS_COLLECTION).getFullList({
      filter: `user="${pbEscape(userId)}" && status="approved" && start_date <= "${ymdDate}" && end_date >= "${ymdDate}"`,
      requestKey: null,
    });
    return list.length > 0;
  } catch {
    return false;
  }
}
