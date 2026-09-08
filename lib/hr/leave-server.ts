/**
 * Server-side leave mutations (Wave 2).
 * All writes use admin PocketBase after auth/RBAC/company-scope checks.
 * Client must not set user / status / hr_action_*.
 */

import type PocketBase from "pocketbase";
import {
  DEFAULT_LEAVE_BOOKING_REASON,
  HR_ACTION_AT_FIELD,
  HR_ACTION_BY_FIELD,
  HR_ACTION_NAME_FIELD,
  calendarDaysFromTodayUntilLeaveStart,
  expandInclusiveDateRange,
  getMaxBookingsPerMonth,
  leaveBookingsQuotaFromProfileRecord,
  normalizeLeaveRequestsFromPb,
  resolveProfileDivisionKey,
  todayYmdLocal,
  type LeaveRequest,
  type LeaveRequestStatus,
} from "@/lib/leave";
import { computeLeaveCompensationAmount } from "@/lib/hr-compensation";
import { PROFILE_LEAVE_DAILY_RATE_FIELD } from "@/lib/profile";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { isHrOperationalActor } from "@/lib/access/hr-api-enforcement";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import {
  assertOrgHierarchyApprover,
  canOrgHierarchyApprove,
} from "@/lib/hr/org-approval-authority";

const DEFAULT_MAX_PEOPLE_PER_DAY = 2;
const MAX_DAYS_PER_BOOKING = 1;
const LEAVE_COLLECTION = "leave_requests";
const HR_COMPENSATION_SETTINGS_COLLECTION = "hr_compensation_settings";

function pbEscape(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function leaveUserId(raw: Record<string, unknown>): string {
  const u = raw.user;
  if (typeof u === "string") return u;
  if (u && typeof u === "object" && "id" in u) return String((u as { id: string }).id ?? "");
  return "";
}

function ymdFromUnknown(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : "";
}

function pickLeaveDates(raw: Record<string, unknown>): { start_date: string; end_date: string } {
  const legacy = raw.date ?? raw.Date;
  if (legacy !== undefined && legacy !== null && String(legacy).trim()) {
    const single = ymdFromUnknown(legacy);
    if (single) {
      const note = String(raw.note ?? raw.Note ?? "");
      const m = /\|\s*s\.d\.\s*(\d{4}-\d{2}-\d{2})/i.exec(note);
      if (m?.[1] && m[1] >= single) return { start_date: single, end_date: m[1] };
      return { start_date: single, end_date: single };
    }
  }
  const s = ymdFromUnknown(raw.start_date ?? raw.startDate);
  const e = ymdFromUnknown(raw.end_date ?? raw.endDate) || s;
  return { start_date: s, end_date: e };
}

function leaveRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const s1 = ymdFromUnknown(aStart);
  const e1 = ymdFromUnknown(aEnd);
  const s2 = ymdFromUnknown(bStart);
  const e2 = ymdFromUnknown(bEnd);
  return Boolean(s1 && e1 && s2 && e2 && s1 <= e2 && s2 <= e1);
}

function displayName(user: Record<string, unknown>): string {
  return String(user.name ?? user.email ?? user.id ?? "").trim() || String(user.id ?? "");
}

function buildHrActionFromActor(ctx: HrApiAuthContext): Record<string, string> {
  return {
    [HR_ACTION_BY_FIELD]: ctx.userId,
    [HR_ACTION_NAME_FIELD]: displayName(ctx.user),
    [HR_ACTION_AT_FIELD]: new Date().toISOString(),
  };
}

/**
 * Without leave_requests.company schema: scope via leave owner's biz_user_companies
 * intersecting actor's accessible companies. Owner bypass. Empty → fail closed.
 */
export async function assertHrLeaveSubjectInScope(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  leaveUserIdValue: string,
): Promise<void> {
  if (ctx.isOwner) return;
  if (!isHrOperationalActor(ctx)) {
    throw new HrApiError("Akses HR ditolak.", 403);
  }
  const effectiveCompanies = await getHrOperationalCompanyIds(adminPb, ctx);
  if (effectiveCompanies.length === 0) {
    throw new HrApiError("Scope entitas HR tidak dapat ditentukan.", 403);
  }
  const subjectCompanies = await getAccessibleCompanyIds(adminPb, leaveUserIdValue);
  if (subjectCompanies.length === 0) {
    throw new HrApiError(
      "Scope entitas karyawan tidak dapat ditentukan (tidak ada membership company).",
      403,
    );
  }
  const overlap = subjectCompanies.some((id) => effectiveCompanies.includes(id));
  if (!overlap) {
    throw new HrApiError("Akses lintas entitas ditolak.", 403);
  }
}

async function emitLeaveEvent(
  adminPb: PocketBase,
  input: {
    event_code: string;
    actor_id: string;
    entity_id: string;
    entity_label?: string;
    company_id?: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await emitBusinessEventServer(adminPb, {
    event_code: input.event_code,
    severity: "info",
    module: "hr",
    entity_type: LEAVE_COLLECTION,
    entity_id: input.entity_id,
    entity_label: input.entity_label,
    actor_id: input.actor_id,
    payload: {
      ...input.payload,
      company_id: input.company_id,
    },
    dedupe_key: `${input.event_code}:${input.entity_id}:${Date.now()}`,
  });
}

async function resolveMaxBookings(adminPb: PocketBase, userId: string): Promise<number> {
  try {
    const list = await adminPb.collection("profiles").getList(1, 1, {
      filter: `user="${pbEscape(userId)}"`,
      sort: "-updated",
      requestKey: null,
    });
    const prof = list.items[0] as Record<string, unknown> | undefined;
    if (!prof) return getMaxBookingsPerMonth();
    const parsed = leaveBookingsQuotaFromProfileRecord(prof);
    if (parsed != null) return parsed;
  } catch {
    /* ignore */
  }
  return getMaxBookingsPerMonth();
}

async function getMonthlyUsed(adminPb: PocketBase, userId: string): Promise<number> {
  const ref = new Date();
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const start = new Date(y, m, 1, 0, 0, 0, 0).toISOString();
  const nextStart = new Date(y, m + 1, 1, 0, 0, 0, 0).toISOString();
  try {
    const list = await adminPb.collection(LEAVE_COLLECTION).getFullList({
      filter: `user="${pbEscape(userId)}" && (status="pending" || status="approved") && created >= "${start}" && created < "${nextStart}"`,
      requestKey: null,
    });
    return list.length;
  } catch {
    const all = await adminPb.collection(LEAVE_COLLECTION).getFullList({
      filter: `user="${pbEscape(userId)}" && (status="pending" || status="approved")`,
      requestKey: null,
    });
    const startMs = new Date(start).getTime();
    const endMs = new Date(nextStart).getTime();
    return all.filter((row) => {
      const c = new Date(String((row as { created?: string }).created ?? "")).getTime();
      return !Number.isNaN(c) && c >= startMs && c < endMs;
    }).length;
  }
}

async function fetchPendingOrApproved(
  adminPb: PocketBase,
  userId: string,
): Promise<LeaveRequest[]> {
  const list = await adminPb.collection(LEAVE_COLLECTION).getFullList({
    filter: `user="${pbEscape(userId)}" && (status="pending" || status="approved")`,
    sort: "-created",
    requestKey: null,
  });
  return normalizeLeaveRequestsFromPb(list as unknown[]);
}

async function fetchApproved(
  adminPb: PocketBase,
  userId: string,
): Promise<LeaveRequest[]> {
  const list = await adminPb.collection(LEAVE_COLLECTION).getFullList({
    filter: `user="${pbEscape(userId)}" && status="approved"`,
    sort: "-created",
    requestKey: null,
  });
  return normalizeLeaveRequestsFromPb(list as unknown[]);
}

async function getDivisionQuota(adminPb: PocketBase, division: string): Promise<number> {
  try {
    const quota = await adminPb.collection("division_quotas").getFirstListItem(
      `division="${pbEscape(division)}"`,
      { requestKey: null },
    );
    return (quota as { max_people_per_day?: number }).max_people_per_day || DEFAULT_MAX_PEOPLE_PER_DAY;
  } catch {
    return DEFAULT_MAX_PEOPLE_PER_DAY;
  }
}

async function checkDivisionQuota(
  adminPb: PocketBase,
  division: string,
  start: string,
  end: string,
  excludeUserId: string,
): Promise<{ success: boolean; blockedDates: string[] }> {
  const maxPeople = await getDivisionQuota(adminPb, division);
  const days = expandInclusiveDateRange(start, end);
  const blocked: string[] = [];
  let records: Record<string, unknown>[] = [];

  // Live schema uses `devision` (legacy typo). `division` may be absent — do not
  // require it in filters or PocketBase returns 400 and approve fails closed incorrectly.
  const filterCandidates = [
    `devision="${pbEscape(division)}" && (status="approved" || status="pending")`,
    `division="${pbEscape(division)}" && (status="approved" || status="pending")`,
    `(division="${pbEscape(division)}" || devision="${pbEscape(division)}") && (status="approved" || status="pending")`,
  ];
  let loaded = false;
  for (const filter of filterCandidates) {
    try {
      records = (await adminPb.collection(LEAVE_COLLECTION).getFullList({
        filter,
        requestKey: null,
      })) as unknown as Record<string, unknown>[];
      loaded = true;
      break;
    } catch {
      /* try next filter shape */
    }
  }
  if (!loaded) {
    return { success: false, blockedDates: [] };
  }

  for (const day of days) {
    let count = 0;
    for (const raw of records) {
      const uid = leaveUserId(raw);
      if (uid === excludeUserId) continue;
      const bounds = pickLeaveDates(raw);
      if (leaveRangesOverlap(bounds.start_date, bounds.end_date, day, day)) count += 1;
    }
    if (count >= maxPeople) blocked.push(day);
  }
  return { success: blocked.length === 0, blockedDates: blocked };
}

async function resolveLeaveDailyRate(adminPb: PocketBase, userId: string): Promise<number> {
  try {
    const list = await adminPb.collection("profiles").getList(1, 1, {
      filter: `user="${pbEscape(userId)}"`,
      sort: "-updated",
      requestKey: null,
    });
    const prof = list.items[0] as Record<string, unknown> | undefined;
    const fromProf = Math.max(0, Math.round(Number(prof?.[PROFILE_LEAVE_DAILY_RATE_FIELD]) || 0));
    if (fromProf > 0) return fromProf;
  } catch {
    /* ignore */
  }
  try {
    const active = await adminPb
      .collection(HR_COMPENSATION_SETTINGS_COLLECTION)
      .getFirstListItem("is_active=true", { requestKey: null });
    return Math.max(
      0,
      Math.round(Number((active as { leave_daily_compensation_rate?: number }).leave_daily_compensation_rate) || 0),
    );
  } catch {
    try {
      const list = await adminPb.collection(HR_COMPENSATION_SETTINGS_COLLECTION).getList(1, 1, {
        sort: "-updated",
        requestKey: null,
      });
      const row = list.items[0] as { leave_daily_compensation_rate?: number } | undefined;
      return Math.max(0, Math.round(Number(row?.leave_daily_compensation_rate) || 0));
    } catch {
      return 0;
    }
  }
}

async function assertCanApproveOrRejectLeave(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  subjectUserId: string,
): Promise<void> {
  // FLEX-ORG-05-FIX — FOM/entity scope first (HR admin cannot approve outside ops scope).
  await assertHrLeaveSubjectInScope(adminPb, ctx, subjectUserId);
  await assertOrgHierarchyApprover(adminPb, ctx, subjectUserId, {
    selfApproveCode: "LEAVE_SELF_APPROVE",
    orgAuthorityCode: "LEAVE_ORG_AUTHORITY_REQUIRED",
    // Fallback only when subject has no org seat — still gated by FOM scope above.
    allowHrAdminFallback: true,
  });
}

/**
 * Scoped leave monitor for HR Desktop — all statuses within FOM operational entity scope.
 * Fail-closed when FOM ops empty (non-owner).
 */
export async function serverListLeaveForHrScope(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<Record<string, unknown>[]> {
  if (!ctx.isOwner && !isHrOperationalActor(ctx)) {
    throw new HrApiError("Akses HR ditolak.", 403);
  }
  const operational = await getHrOperationalCompanyIds(adminPb, ctx);
  if (!ctx.isOwner && operational.length === 0) return [];

  const rows = await adminPb.collection(LEAVE_COLLECTION).getFullList({
    sort: "-created",
    expand: "user",
    requestKey: null,
  });

  if (ctx.isOwner) return rows as unknown as Record<string, unknown>[];

  const out: Record<string, unknown>[] = [];
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const subject = leaveUserId(r);
    if (!subject) continue;
    try {
      await assertHrLeaveSubjectInScope(adminPb, ctx, subject);
      out.push(r);
    } catch {
      /* out of FOM / membership scope */
    }
  }
  return out;
}

/** Scoped pending leave queue for approvers (Mobile/Desktop) — no raw PB getFullList. */
export async function serverListPendingLeaveForApprover(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<Record<string, unknown>[]> {
  const operational = await getHrOperationalCompanyIds(adminPb, ctx);
  if (!ctx.isOwner && operational.length === 0) return [];

  const rows = await adminPb.collection(LEAVE_COLLECTION).getFullList({
    filter: 'status="pending"',
    sort: "-created",
    expand: "user",
    requestKey: null,
  });
  const out: Record<string, unknown>[] = [];
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const subject = leaveUserId(r);
    if (!subject) continue;
    try {
      await assertHrLeaveSubjectInScope(adminPb, ctx, subject);
    } catch {
      continue;
    }
    if (
      await canOrgHierarchyApprove(adminPb, ctx, subject, {
        selfApproveCode: "LEAVE_SELF_APPROVE",
        orgAuthorityCode: "LEAVE_ORG_AUTHORITY_REQUIRED",
        allowHrAdminFallback: true,
      })
    ) {
      out.push(r);
    }
  }
  return out;
}

export type LeaveMutationResult = {
  success: boolean;
  message: string;
  data?: LeaveRequest;
  id?: string;
};

export async function serverSubmitLeave(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: { start_date?: string; end_date?: string; reason?: string },
): Promise<LeaveMutationResult> {
  const userId = ctx.userId;
  const start_date = String(input.start_date ?? "").trim();
  const end_date = String(input.end_date ?? "").trim();
  if (!start_date || !end_date) {
    return { success: false, message: "Tanggal mulai dan selesai wajib diisi" };
  }

  const reasonText =
    typeof input.reason === "string" && input.reason.trim().length > 0
      ? input.reason.trim()
      : DEFAULT_LEAVE_BOOKING_REASON;

  let profile: Record<string, unknown>;
  try {
    profile = (await adminPb.collection("profiles").getFirstListItem(`user="${pbEscape(userId)}"`, {
      requestKey: null,
    })) as unknown as Record<string, unknown>;
  } catch {
    return {
      success: false,
      message:
        "Profil karyawan tidak ditemukan di PocketBase. Hubungi HR agar profil Anda dibuat / disinkronkan.",
    };
  }

  const divisionKey = resolveProfileDivisionKey(
    profile as { division?: string; department?: string },
  );
  const positionClean = String(profile.position ?? "").trim();
  if (!divisionKey || !positionClean) {
    return {
      success: false,
      message:
        "Data profil belum lengkap: divisi atau departemen dan jabatan harus diisi di HR. Hubungi HR.",
    };
  }

  const todayStr = todayYmdLocal();
  if (start_date < todayStr) {
    return { success: false, message: "Tanggal mulai tidak boleh di masa lalu" };
  }
  if (start_date > end_date) {
    return { success: false, message: "Tanggal mulai tidak boleh setelah tanggal selesai" };
  }

  const rangeDays = expandInclusiveDateRange(start_date, end_date);
  const days = rangeDays.length;
  if (days > MAX_DAYS_PER_BOOKING) {
    return {
      success: false,
      message: `Maksimal ${MAX_DAYS_PER_BOOKING} hari per booking. Anda memilih ${days} hari.`,
    };
  }

  const maxMonthly = await resolveMaxBookings(adminPb, userId);
  const used = await getMonthlyUsed(adminPb, userId);
  if (used >= maxMonthly) {
    return {
      success: false,
      message: `Kuota pengajuan bulan ini habis (${maxMonthly}× per bulan). Batalkan pengajuan yang belum diproses / disetujui atau tunggu bulan depan.`,
    };
  }

  const existing = await fetchPendingOrApproved(adminPb, userId);
  if (existing.some((lv) => leaveRangesOverlap(lv.start_date, lv.end_date, start_date, end_date))) {
    return {
      success: false,
      message:
        "Periode ini bertabrakan dengan pengajuan atau cuti Anda yang lain. Pilih tanggal lain.",
    };
  }

  const noteLegacy =
    days > 1 ? `${reasonText} | s.d. ${end_date} (${days} hari)` : reasonText;

  const record = await adminPb.collection(LEAVE_COLLECTION).create({
    user: userId,
    start_date,
    end_date,
    reason: reasonText,
    status: "pending",
    division: divisionKey,
    devision: divisionKey,
    position: positionClean,
    booking_date: new Date().toISOString(),
    date: start_date,
    note: noteLegacy,
  });

  let stored: Record<string, unknown> = record as unknown as Record<string, unknown>;
  try {
    stored = (await adminPb.collection(LEAVE_COLLECTION).getOne(record.id, {
      requestKey: null,
    })) as unknown as Record<string, unknown>;
  } catch {
    /* use create response */
  }

  const savedBounds = pickLeaveDates(stored);
  if (!ymdFromUnknown(savedBounds.start_date) || !ymdFromUnknown(savedBounds.end_date)) {
    return {
      success: false,
      message:
        "Tanggal cuti tidak tersimpan. Di PocketBase: koleksi `leave_requests` harus punya field **`date`** (atau `start_date`/`end_date`) dan rule Create mengizinkan server mengisinya.",
    };
  }

  const updatedUsed = await getMonthlyUsed(adminPb, userId);
  const data = normalizeLeaveRequestsFromPb([stored])[0];

  await emitLeaveEvent(adminPb, {
    event_code: "hr.leave.submitted",
    actor_id: userId,
    entity_id: String(record.id),
    entity_label: `${start_date} → pending`,
    company_id: ctx.companyIds[0],
    payload: { status: "pending", start_date, end_date },
  });

  return {
    success: true,
    message: `Pengajuan cuti (${days} hari) terkirim & menunggu persetujuan HR. Pengajuan bulan ini: ${updatedUsed}/${maxMonthly}.`,
    data,
    id: String(record.id),
  };
}

export async function serverApproveLeave(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  requestId: string,
): Promise<LeaveMutationResult> {
  const record = (await adminPb.collection(LEAVE_COLLECTION).getOne(requestId)) as unknown as Record<
    string,
    unknown
  >;
  const status = String(record.status ?? "") as LeaveRequestStatus;
  if (status !== "pending") {
    return {
      success: false,
      message: "Hanya pengajuan berstatus Menunggu yang bisa disetujui.",
    };
  }

  const userId = leaveUserId(record);
  await assertCanApproveOrRejectLeave(adminPb, ctx, userId);

  const bounds = pickLeaveDates(record);
  const divisionKey = String(record.division ?? record.devision ?? "").trim();
  const start = ymdFromUnknown(bounds.start_date);
  const end = ymdFromUnknown(bounds.end_date);

  if (!(userId && divisionKey && start && end)) {
    return { success: false, message: "Data pengajuan tidak lengkap." };
  }

  const quotaCheck = await checkDivisionQuota(adminPb, divisionKey, start, end, userId);
  if (!quotaCheck.success) {
    if (quotaCheck.blockedDates.length === 0) {
      return {
        success: false,
        message:
          "Gagal memeriksa kuota divisi. Periksa koneksi atau rule PocketBase, lalu coba lagi.",
      };
    }
    const maxPeople = await getDivisionQuota(adminPb, divisionKey);
    const blockedDatesStr = quotaCheck.blockedDates
      .slice(0, 5)
      .map((d) => new Date(`${d}T12:00:00`).toLocaleDateString("id-ID"))
      .join(", ");
    return {
      success: false,
      message: `Kuota divisi penuh untuk tanggal: ${blockedDatesStr}${
        quotaCheck.blockedDates.length > 5 ? "..." : ""
      }. Maksimal ${maxPeople} orang per hari.`,
    };
  }

  const approved = await fetchApproved(adminPb, userId);
  if (
    approved.some(
      (lv) =>
        lv.id !== requestId && leaveRangesOverlap(lv.start_date, lv.end_date, start, end),
    )
  ) {
    return {
      success: false,
      message:
        "Karyawan sudah punya cuti disetujui lain yang bertabrakan dengan tanggal ini.",
    };
  }

  const dailyRate = await resolveLeaveDailyRate(adminPb, userId);
  const compensation_amount = computeLeaveCompensationAmount(start, end, dailyRate);
  const hrPayload = buildHrActionFromActor(ctx);

  await adminPb.collection(LEAVE_COLLECTION).update(requestId, {
    status: "approved",
    ...hrPayload,
    daily_compensation_rate: dailyRate,
    compensation_amount,
  });

  await emitLeaveEvent(adminPb, {
    event_code: "hr.leave.approved",
    actor_id: ctx.userId,
    entity_id: requestId,
    entity_label: `${start} approved`,
    company_id: ctx.companyIds[0],
    payload: { status: "approved", leave_user: userId, compensation_amount },
  });

  const payHint =
    dailyRate > 0
      ? ` Kompensasi: ${compensation_amount.toLocaleString("id-ID")} (${dailyRate.toLocaleString("id-ID")}/hari).`
      : "";

  return { success: true, message: `Pengajuan disetujui.${payHint}`, id: requestId };
}

export async function serverRejectLeave(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  requestId: string,
  reasonRaw: string,
): Promise<LeaveMutationResult> {
  const reason = String(reasonRaw ?? "").trim();
  if (reason.length < 5) {
    return {
      success: false,
      message: "Berikan alasan penolakan untuk staff (minimal 5 karakter).",
    };
  }

  const record = (await adminPb.collection(LEAVE_COLLECTION).getOne(requestId)) as unknown as Record<
    string,
    unknown
  >;
  const userId = leaveUserId(record);
  await assertCanApproveOrRejectLeave(adminPb, ctx, userId);
  if (String(record.status) !== "pending") {
    return {
      success: false,
      message: "Hanya pengajuan Menunggu yang bisa ditolak.",
    };
  }

  const hrPayload = buildHrActionFromActor(ctx);

  try {
    await adminPb.collection(LEAVE_COLLECTION).update(requestId, {
      status: "rejected",
      rejection_reason: reason,
      ...hrPayload,
    });
  } catch {
    const baseNote = String(record.note ?? "").trimEnd();
    const tag = `\n\n[Penolakan HR]: ${reason}`;
    await adminPb.collection(LEAVE_COLLECTION).update(requestId, {
      status: "rejected",
      note: (baseNote + tag).trim(),
      ...hrPayload,
    });
  }

  await emitLeaveEvent(adminPb, {
    event_code: "hr.leave.rejected",
    actor_id: ctx.userId,
    entity_id: requestId,
    entity_label: "rejected",
    company_id: ctx.companyIds[0],
    payload: { status: "rejected", leave_user: userId },
  });

  return {
    success: true,
    message: "Pengajuan ditolak. Staff dapat membaca alasannya di riwayat cuti.",
    id: requestId,
  };
}

export async function serverCancelLeave(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  requestId: string,
): Promise<LeaveMutationResult> {
  const record = (await adminPb.collection(LEAVE_COLLECTION).getOne(requestId)) as unknown as Record<
    string,
    unknown
  >;
  const ownerId = leaveUserId(record);
  if (ownerId !== ctx.userId) {
    throw new HrApiError("Anda hanya dapat membatalkan cuti milik sendiri.", 403);
  }

  const status = String(record.status ?? "") as LeaveRequestStatus;
  if (status === "cancelled" || status === "rejected") {
    return { success: false, message: "Pengajuan ini tidak aktif lagi." };
  }
  if (status !== "pending" && status !== "approved") {
    return { success: false, message: "Status ini tidak bisa dibatalkan dari aplikasi." };
  }

  const bounds = pickLeaveDates(record);
  const ymd = ymdFromUnknown(bounds.start_date);
  const daysAhead = calendarDaysFromTodayUntilLeaveStart(ymd);
  if (daysAhead === null) {
    return { success: false, message: "Data tanggal pengajuan tidak valid di server." };
  }

  if (status === "pending") {
    if (daysAhead < 1) {
      return {
        success: false,
        message:
          daysAhead < 0
            ? "Tidak dapat membatalkan pengajuan yang tanggal mulainya sudah lewat."
            : "Tidak dapat membatalkan pengajuan yang mulai hari ini. Hubungi HR jika diperlukan.",
      };
    }
  }

  if (status === "approved") {
    if (daysAhead < 1) {
      return {
        success: false,
        message:
          daysAhead < 0
            ? "Tidak dapat membatalkan cuti yang sudah lewat atau sedang berjalan."
            : "Tidak dapat membatalkan cuti yang mulai hari ini.",
      };
    }
    if (daysAhead < 2) {
      return {
        success: false,
        message:
          "Cuti yang sudah disetujui HR tidak dapat dibatalkan mulai masuk H−1 (satu hari kalender sebelum mulai). Syarat pembatalan: paling lambat dua hari sebelum tanggal mulai cuti. Silakan hubungi HR untuk penyesuaian.",
      };
    }
  }

  // cancelled_by / cancelled_at: schema NOT VERIFIED — do not invent fields; audit event carries actor.
  await adminPb.collection(LEAVE_COLLECTION).update(requestId, {
    status: "cancelled",
  });

  await emitLeaveEvent(adminPb, {
    event_code: "hr.leave.cancelled",
    actor_id: ctx.userId,
    entity_id: requestId,
    entity_label: `${ymd} cancelled`,
    company_id: ctx.companyIds[0],
    payload: { status: "cancelled", previous_status: status },
  });

  return {
    success: true,
    message:
      status === "pending"
        ? "Pengajuan berhasil dibatalkan."
        : "Cuti yang disetujui berhasil dibatalkan.",
    id: requestId,
  };
}
