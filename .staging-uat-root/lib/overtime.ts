/**
 * Modul lembur: HR menunjuk / staff mengajukan; staff terima-tolak penunjukan; HR ACC / tolak pengajuan.
 * Koleksi PocketBase: `overtime_requests`
 */

import { ClientResponseError } from "pocketbase";
import { pb } from "./pocketbase";
import { getErrorMessage } from "./errors";
import {
  computeOvertimePayAmount,
  computeOvertimePaySimple,
  fetchHrCompensationSettings,
} from "./hr-compensation";
import {
  HR_ACTION_AT_FIELD,
  HR_ACTION_BY_FIELD,
  HR_ACTION_NAME_FIELD,
} from "./leave";

const COLLECTION = "overtime_requests";

export type OvertimeSource = "hr_assignment" | "staff_request";

export type OvertimeStatus =
  | "waiting_staff"
  | "waiting_hr"
  | "staff_accepted"
  | "staff_declined"
  | "hr_approved"
  | "hr_rejected";

export interface OvertimeRequest {
  id: string;
  user: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  source: OvertimeSource;
  status: OvertimeStatus;
  reason: string;
  hr_note?: string;
  rejection_reason?: string;
  staff_decline_note?: string;
  created_by?: string;
  hr_action_by?: string;
  hr_action_name?: string;
  hr_action_at?: string;
  /** Tarif per jam (Rp) — diisi HR saat penunjukan/approve. */
  hourly_rate?: number;
  /** Pengali (mis. 1.5). */
  pay_multiplier?: number;
  /** Jam × tarif × pengali — disimpan untuk payroll. */
  pay_amount?: number;
  created: string;
  updated: string;
}

function pbEscape(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function hrActionPayload(): Record<string, string> {
  const m = pb.authStore.model as { id?: string; name?: string; email?: string } | null;
  if (!m?.id) return {};
  const id = String(m.id);
  const name = String(m.name ?? m.email ?? "").trim();
  return {
    [HR_ACTION_BY_FIELD]: id,
    [HR_ACTION_NAME_FIELD]: name || id,
    [HR_ACTION_AT_FIELD]: new Date().toISOString(),
  };
}

export function formatOvertimeHrActionSummary(row: OvertimeRequest): string | null {
  const name = row.hr_action_name?.trim();
  const at = row.hr_action_at?.trim();
  if (!name && !at) return null;
  const parts: string[] = [];
  if (name) parts.push(name);
  if (at) {
    const d = new Date(at);
    if (!Number.isNaN(d.getTime())) {
      parts.push(
        d.toLocaleString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Validasi format HH:mm (24 jam). */
export function isValidTimeHm(s: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(s).trim());
}

/** Menit dari tengah malam; null jika invalid. */
function parseHmToMinutes(s: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(s).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Jam lembur (desimal); mendukung lembur melewati tengah malam (end < start → +24 jam). */
export function computeOvertimeHours(start: string, end: string): number {
  const a = parseHmToMinutes(start);
  const b = parseHmToMinutes(end);
  if (a === null || b === null) return 0;
  let diff = b - a;
  if (diff <= 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

function overtimeUserId(raw: { user?: unknown }): string {
  const u = raw.user;
  if (u && typeof u === "object" && u !== null && "id" in u) {
    return String((u as { id: string }).id);
  }
  return String(u ?? "");
}

export function normalizeOvertimeFromPb(items: unknown[]): OvertimeRequest[] {
  return items.map((row) => {
    const raw = row as Record<string, unknown>;
    const st = String(raw.status ?? "waiting_hr") as OvertimeStatus;
    const src = String(raw.source ?? "staff_request") as OvertimeSource;
    const h =
      typeof raw.hours === "number"
        ? raw.hours
        : typeof raw.hours === "string"
          ? parseFloat(raw.hours)
          : computeOvertimeHours(String(raw.start_time ?? ""), String(raw.end_time ?? ""));
    return {
      id: String(raw.id ?? ""),
      user: overtimeUserId(raw as { user?: unknown }),
      work_date: String(raw.work_date ?? "").slice(0, 10),
      start_time: String(raw.start_time ?? "").trim(),
      end_time: String(raw.end_time ?? "").trim(),
      hours: Number.isFinite(h) ? h : 0,
      source: src === "hr_assignment" ? "hr_assignment" : "staff_request",
      status: st,
      reason: String(raw.reason ?? "").trim(),
      hr_note: String(raw.hr_note ?? "").trim() || undefined,
      rejection_reason: String(raw.rejection_reason ?? "").trim() || undefined,
      staff_decline_note: String(raw.staff_decline_note ?? "").trim() || undefined,
      created_by: String(raw.created_by ?? "").trim() || undefined,
      hr_action_by: String(raw[HR_ACTION_BY_FIELD] ?? raw.hr_action_by ?? "").trim() || undefined,
      hr_action_name: String(raw[HR_ACTION_NAME_FIELD] ?? raw.hr_action_name ?? "").trim() || undefined,
      hr_action_at: String(raw[HR_ACTION_AT_FIELD] ?? raw.hr_action_at ?? "").trim() || undefined,
      hourly_rate:
        raw.hourly_rate != null && raw.hourly_rate !== ""
          ? Math.round(Number(raw.hourly_rate) || 0)
          : undefined,
      pay_multiplier:
        raw.pay_multiplier != null && raw.pay_multiplier !== ""
          ? Number(raw.pay_multiplier) || undefined
          : undefined,
      pay_amount:
        raw.pay_amount != null && raw.pay_amount !== ""
          ? Math.round(Number(raw.pay_amount) || 0)
          : undefined,
      created: String(raw.created ?? ""),
      updated: String(raw.updated ?? ""),
    };
  });
}

async function resolveOvertimeRates(input?: {
  hourly_rate?: number;
  pay_multiplier?: number;
}): Promise<{ hourly_rate: number; pay_multiplier: number }> {
  const settings = await fetchHrCompensationSettings();
  return {
    hourly_rate: Math.max(
      0,
      Math.round(
        input?.hourly_rate != null && input.hourly_rate > 0
          ? input.hourly_rate
          : settings?.overtime_hourly_rate ?? 0
      )
    ),
    pay_multiplier: Math.max(
      1,
      input?.pay_multiplier != null && input.pay_multiplier > 0
        ? input.pay_multiplier
        : settings?.overtime_multiplier ?? 1
    ),
  };
}

function buildOvertimePayFields(
  hours: number,
  rates: { hourly_rate: number; pay_multiplier?: number },
  payAmountOverride?: number
): { hourly_rate: number; pay_multiplier: number; pay_amount: number } {
  const mult = Math.max(1, rates.pay_multiplier ?? 1);
  const amount =
    payAmountOverride != null && payAmountOverride >= 0
      ? Math.round(payAmountOverride)
      : computeOvertimePaySimple(hours, rates.hourly_rate);
  return {
    hourly_rate: rates.hourly_rate,
    pay_multiplier: mult,
    pay_amount: amount,
  };
}

export async function fetchOvertimeForHr(): Promise<OvertimeRequest[]> {
  const result = await pb.collection(COLLECTION).getFullList({
    sort: "-created",
    expand: "user",
    requestKey: null,
  });
  return normalizeOvertimeFromPb(result as unknown[]);
}

export async function fetchOvertimeForUser(userId: string): Promise<OvertimeRequest[]> {
  if (!userId?.trim()) return [];
  const result = await pb.collection(COLLECTION).getFullList({
    filter: `user="${pbEscape(userId)}"`,
    sort: "-created",
    requestKey: null,
  });
  return normalizeOvertimeFromPb(result as unknown[]);
}

export async function createHrAssignment(input: {
  userId: string;
  work_date: string;
  start_time: string;
  end_time: string;
  reason: string;
  hr_note?: string;
  hourly_rate?: number;
  pay_multiplier?: number;
}): Promise<{ success: boolean; message: string }> {
  const uid = pb.authStore.model?.id;
  if (!uid) return { success: false, message: "Login HR diperlukan." };
  if (!input.userId?.trim()) return { success: false, message: "Pilih karyawan." };
  if (!input.work_date?.trim()) return { success: false, message: "Tanggal lembur wajib." };
  if (!isValidTimeHm(input.start_time) || !isValidTimeHm(input.end_time)) {
    return { success: false, message: "Format jam awal/akhir pakai HH:mm (contoh 18:00)." };
  }
  const reason = input.reason.trim();
  if (reason.length < 5) return { success: false, message: "Alasan / keterangan minimal 5 karakter." };

  const hours = computeOvertimeHours(input.start_time, input.end_time);
  if (hours <= 0) return { success: false, message: "Rentang jam tidak valid." };

  const rates = await resolveOvertimeRates({
    hourly_rate: input.hourly_rate,
    pay_multiplier: input.pay_multiplier,
  });
  const payFields = buildOvertimePayFields(hours, rates);

  try {
    await pb.collection(COLLECTION).create({
      user: input.userId.trim(),
      work_date: input.work_date.trim(),
      start_time: input.start_time.trim(),
      end_time: input.end_time.trim(),
      hours,
      source: "hr_assignment",
      status: "waiting_staff",
      reason,
      hr_note: (input.hr_note ?? "").trim(),
      created_by: String(uid),
      ...payFields,
    });
    return { success: true, message: "Penunjukan lembur terkirim. Staff dapat menerima atau menolak." };
  } catch (e: unknown) {
    return { success: false, message: getErrorMessage(e, "Gagal menyimpan penunjukan lembur.") };
  }
}

export async function createStaffOvertimeRequest(input: {
  work_date: string;
  start_time: string;
  end_time: string;
  reason: string;
}): Promise<{ success: boolean; message: string }> {
  const uid = pb.authStore.model?.id;
  if (!uid) return { success: false, message: "Silakan login." };
  if (!input.work_date?.trim()) return { success: false, message: "Tanggal lembur wajib." };
  if (!isValidTimeHm(input.start_time) || !isValidTimeHm(input.end_time)) {
    return { success: false, message: "Format jam pakai HH:mm (contoh 18:30)." };
  }
  const reason = input.reason.trim();
  if (reason.length < 10) return { success: false, message: "Jelaskan alasan lembur (minimal 10 karakter)." };
  const hours = computeOvertimeHours(input.start_time, input.end_time);
  if (hours <= 0) return { success: false, message: "Rentang jam tidak valid." };

  try {
    await pb.collection(COLLECTION).create({
      user: uid,
      work_date: input.work_date.trim(),
      start_time: input.start_time.trim(),
      end_time: input.end_time.trim(),
      hours,
      source: "staff_request",
      status: "waiting_hr",
      reason,
      created_by: String(uid),
    });
    return { success: true, message: "Pengajuan lembur terkirim. Menunggu persetujuan HR." };
  } catch (e: unknown) {
    return { success: false, message: getErrorMessage(e, "Gagal mengirim pengajuan lembur.") };
  }
}

export async function staffAcceptAssignment(requestId: string): Promise<{ success: boolean; message: string }> {
  const uid = pb.authStore.model?.id;
  if (!uid) return { success: false, message: "Silakan login." };
  try {
    const rec = await pb.collection(COLLECTION).getOne(requestId);
    const raw = rec as unknown as Record<string, unknown>;
    if (String(raw.status) !== "waiting_staff") {
      return { success: false, message: "Status tidak lagi menunggu respons Anda." };
    }
    if (overtimeUserId(raw as { user?: unknown }) !== uid) {
      return { success: false, message: "Bukan data lembur untuk akun Anda." };
    }
    await pb.collection(COLLECTION).update(requestId, { status: "staff_accepted" });
    const src = String(raw.source);
    return {
      success: true,
      message:
        src === "staff_request"
          ? "Persetujuan HR diterima. Lembur masuk perhitungan gaji."
          : "Penunjukan lembur diterima.",
    };
  } catch (e: unknown) {
    if (e instanceof ClientResponseError && e.status === 404) {
      return { success: false, message: "Data lembur tidak ditemukan." };
    }
    return { success: false, message: getErrorMessage(e, "Gagal menyimpan.") };
  }
}

export async function staffDeclineAssignment(
  requestId: string,
  note?: string
): Promise<{ success: boolean; message: string }> {
  const uid = pb.authStore.model?.id;
  if (!uid) return { success: false, message: "Silakan login." };
  try {
    const rec = await pb.collection(COLLECTION).getOne(requestId);
    const raw = rec as unknown as Record<string, unknown>;
    if (String(raw.status) !== "waiting_staff") {
      return { success: false, message: "Status tidak lagi menunggu respons Anda." };
    }
    if (overtimeUserId(raw as { user?: unknown }) !== uid) {
      return { success: false, message: "Bukan penunjukan untuk akun Anda." };
    }
    await pb.collection(COLLECTION).update(requestId, {
      status: "staff_declined",
      staff_decline_note: (note ?? "").trim() || "-",
    });
    return { success: true, message: "Penunjukan ditolak. HR dapat melihat catatan di daftar." };
  } catch (e: unknown) {
    return { success: false, message: getErrorMessage(e, "Gagal menyimpan.") };
  }
}

export async function hrApproveStaffRequest(
  requestId: string,
  options?: { hourly_rate?: number; pay_amount?: number }
): Promise<{ success: boolean; message: string }> {
  try {
    const rec = await pb.collection(COLLECTION).getOne(requestId);
    const raw = rec as unknown as Record<string, unknown>;
    if (String(raw.source) !== "staff_request" || String(raw.status) !== "waiting_hr") {
      return { success: false, message: "Hanya pengajuan staff yang menunggu HR yang dapat disetujui." };
    }
    const hours = Number(raw.hours) || computeOvertimeHours(String(raw.start_time), String(raw.end_time));
    const rates = await resolveOvertimeRates({ hourly_rate: options?.hourly_rate });
    const payFields = buildOvertimePayFields(hours, rates, options?.pay_amount);
    await pb.collection(COLLECTION).update(requestId, {
      status: "waiting_staff",
      ...hrActionPayload(),
      ...payFields,
    });
    return {
      success: true,
      message: `Nominal ${payFields.pay_amount.toLocaleString("id-ID")} dikirim ke staff. Menunggu konfirmasi staff.`,
    };
  } catch (e: unknown) {
    return { success: false, message: getErrorMessage(e, "Gagal menyetujui.") };
  }
}

export async function hrRejectStaffRequest(
  requestId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const r = String(reason ?? "").trim();
  if (r.length < 5) return { success: false, message: "Alasan penolakan minimal 5 karakter." };
  try {
    const rec = await pb.collection(COLLECTION).getOne(requestId);
    const raw = rec as unknown as Record<string, unknown>;
    if (String(raw.source) !== "staff_request" || String(raw.status) !== "waiting_hr") {
      return { success: false, message: "Hanya pengajuan staff yang menunggu HR yang dapat ditolak." };
    }
    await pb.collection(COLLECTION).update(requestId, {
      status: "hr_rejected",
      rejection_reason: r,
      ...hrActionPayload(),
    });
    return { success: true, message: "Pengajuan ditolak. Staff dapat melihat alasan." };
  } catch (e: unknown) {
    return { success: false, message: getErrorMessage(e, "Gagal menolak.") };
  }
}

export const OVERTIME_STATUS_LABEL: Record<OvertimeStatus, string> = {
  waiting_staff: "Menunggu konfirmasi staff",
  waiting_hr: "Menunggu ACC HR",
  staff_accepted: "Staff terima",
  staff_declined: "Staff tolak",
  hr_approved: "Disetujui HR",
  hr_rejected: "Ditolak HR",
};
