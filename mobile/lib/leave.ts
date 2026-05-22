// ========================================
// 📅 LEAVE REQUEST MANAGEMENT - NEW BOOKING SYSTEM
// ========================================
// Konsep:
// - Pengajuan masuk sebagai pending; HR/Owner menyetujui atau menolak.
// - Batas pengajuan per bulan: field profiles.leave_bookings_quota (per akun); fallback 3× (pending + approved by created).
// - Tanpa overlap periode antara pending dan approved untuk user yang sama.
// - Kuota per divisi per hari dicek saat HR approve (division_quotas).
// - Staff booking lewat kalender: satu pengajuan = satu hari (start = end tanggal itu).
// ========================================

import { ClientResponseError } from "pocketbase";
import { pb } from "./pocketbase";
import { getErrorMessage } from "./errors";

// ========================================
// 🔐 TYPES
// ========================================

export type LeaveRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface LeaveRequest {
  id: string;
  user: string;
  start_date: string;
  end_date: string;
  reason: string;
  /** Diisi HR saat menolak; tampil ke staff. */
  rejection_reason?: string;
  status: LeaveRequestStatus;
  division: string;
  position: string;
  booking_date: string;
  created: string;
  updated: string;
  /** User id HR/owner yang menyetujui atau menolak (PocketBase `leave_requests`). */
  hr_action_by?: string;
  /** Nama tampilan HR saat aksi (snapshot). */
  hr_action_name?: string;
  /** ISO waktu HR menyetujui/menolak. */
  hr_action_at?: string;
}

export interface DivisionQuota {
  id: string;
  division: string;
  max_people_per_day: number;
}

export interface AnnualQuotaInfo {
  used: number;
  remaining: number;
  maxPerYear: number;
  percentage: number;
}

/** Kuota bulanan: berapa banyak pengajuan pending+approved dibuat dalam bulan kalender */
export interface MonthlyBookingInfo {
  used: number;
  max: number;
  /** Label bahasa Indonesia, contoh: "mei 2026" dari Intl bisa dikapitalisasi di UI */
  monthLabel: string;
}

// ========================================
// 📊 CONSTANTS
// ========================================

/** Satu pengajuan di app staff (ketukan kalender) = tepat satu hari; rentang lebih panjang tidak dipakai. */
const MAX_DAYS_PER_BOOKING = 1;
/** Legacy: tidak dipakai untuk blokir pengajuan; tetap ada untuk laporan/UI lama yang memanggil getter */
const MAX_DAYS_PER_YEAR = 90;
const MAX_BOOKINGS_PER_MONTH = 3;
const DEFAULT_MAX_PEOPLE_PER_DAY = 2;

/**
 * Opsional di koleksi `profiles`: batas pengajuan cuti **pending + disetujui** per bulan kalender per orang.
 * Tipe Number; jika kosong atau tidak valid, pakai {@link MAX_BOOKINGS_PER_MONTH}.
 */
export const PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD = "leave_bookings_quota";

/**
 * Baca nilai kuota dari record profil / raw PocketBase.
 * Hanya mengembalikan angka jika 1–52; selain itu null (caller memakai default sistem).
 */
export function parseLeaveBookingsQuotaFromProfile(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    return n >= 1 && n <= 52 ? n : null;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    const n = parseInt(t, 10);
    if (Number.isNaN(n)) return null;
    const f = Math.floor(n);
    return f >= 1 && f <= 52 ? f : null;
  }
  return null;
}

/** Field di `leave_requests` untuk jejak siapa HR yang memproses setujui/tolak */
export const HR_ACTION_BY_FIELD = "hr_action_by";
export const HR_ACTION_NAME_FIELD = "hr_action_name";
export const HR_ACTION_AT_FIELD = "hr_action_at";

/** Disimpan kalau pengguna tidak mengisi alasan (field PB tetap terisi). */
export const DEFAULT_LEAVE_BOOKING_REASON =
  "Pengajuan cuti melalui aplikasi — menunggu persetujuan HR.";

/** Untuk PocketBase filter: escape tanda kutip dalam string */
function pbEscape(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Isi field jejak HR saat menyetujui / menolak (panggilan dari client dengan akun HR login). */
function buildHrActionPayload(): Record<string, string> {
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

/** Teks singkat untuk UI: nama HR + tanggal/jam keputusan; null jika tidak ada data. */
export function formatLeaveHrActionSummary(leave: LeaveRequest): string | null {
  const name = leave.hr_action_name?.trim();
  const at = leave.hr_action_at?.trim();
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

/** Kunci kuota divisi harus sama persis dengan nilai field `division` di division_quotas */
export function resolveProfileDivisionKey(profile: {
  division?: string;
  department?: string;
}): string {
  const d = (profile.division ?? "").trim();
  const dep = (profile.department ?? "").trim();
  return d || dep;
}

function startOfUtcMonthFromLocalCalendar(ref: Date): { start: string; nextStart: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const startLocal = new Date(y, m, 1, 0, 0, 0, 0);
  const nextMonthLocal = new Date(y, m + 1, 1, 0, 0, 0, 0);
  return {
    start: startLocal.toISOString(),
    nextStart: nextMonthLocal.toISOString(),
  };
}

// ========================================
// 📊 LEAVE FUNCTIONS
// ========================================

/**
 * Get division quota settings
 */
async function getDivisionQuota(division: string): Promise<number> {
  try {
    const safe = pbEscape(division);
    const quota = await pb.collection("division_quotas").getFirstListItem(
      `division="${safe}"`,
      { requestKey: null }
    );
    return quota.max_people_per_day || DEFAULT_MAX_PEOPLE_PER_DAY;
  } catch {
    // Default: max 2 orang per division per hari
    return DEFAULT_MAX_PEOPLE_PER_DAY;
  }
}

/**
 * Get annual quota usage for a user
 */
export async function getAnnualQuotaUsage(
  userId: string,
  year?: number
): Promise<AnnualQuotaInfo> {
  try {
    const currentYear = year || new Date().getFullYear();
    const startOfYear = `${currentYear}-01-01`;
    const endOfYear = `${currentYear}-12-31`;

    const allApproved = await fetchApprovedLeavesForUser(userId);
    const leaves = allApproved.filter((leave) =>
      leaveRangesOverlap(
        leave.start_date,
        leave.end_date,
        startOfYear,
        endOfYear
      )
    );

    let totalDays = 0;
    for (const leave of leaves) {
      totalDays += calculateDays(leave.start_date, leave.end_date);
    }

    return {
      used: totalDays,
      remaining: MAX_DAYS_PER_YEAR - totalDays,
      maxPerYear: MAX_DAYS_PER_YEAR,
      percentage: Math.round((totalDays / MAX_DAYS_PER_YEAR) * 100),
    };
  } catch (error) {
    console.error("Error getting annual quota:", error);
    return {
      used: 0,
      remaining: MAX_DAYS_PER_YEAR,
      maxPerYear: MAX_DAYS_PER_YEAR,
      percentage: 0,
    };
  }
}

export function getMaxBookingsPerMonth(): number {
  return MAX_BOOKINGS_PER_MONTH;
}

/**
 * Batas booking cuti per bulan untuk **akun/user** ini.
 * Diatur HR per pegawai: field `leave_bookings_quota` di koleksi `profiles` (halaman /hr/employees/[id]).
 * Jika kosong / tidak valid → {@link MAX_BOOKINGS_PER_MONTH}.
 */
export async function resolveMaxBookingsPerMonthForUser(userId: string): Promise<number> {
  if (!userId?.trim()) return MAX_BOOKINGS_PER_MONTH;
  try {
    const list = await pb.collection("profiles").getList(1, 1, {
      filter: `user="${pbEscape(userId)}"`,
      sort: "-updated",
      requestKey: null,
    });
    const prof = list.items[0];
    if (!prof) return MAX_BOOKINGS_PER_MONTH;
    const raw = (prof as Record<string, unknown>)[PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD];
    const parsed = parseLeaveBookingsQuotaFromProfile(raw);
    if (parsed != null) return parsed;
  } catch {
    /* profil tidak ada / rule */
  }
  return MAX_BOOKINGS_PER_MONTH;
}

/**
 * Hitung pengajuan dalam bulan: status **pending** atau **approved** (by `created`).
 */
export async function getMonthlyBookingUsage(
  userId: string,
  referenceDate?: Date
): Promise<MonthlyBookingInfo> {
  const ref = referenceDate ?? new Date();
  const { start, nextStart } = startOfUtcMonthFromLocalCalendar(ref);
  const maxMonthly = await resolveMaxBookingsPerMonthForUser(userId);

  try {
    let leaves: LeaveRequest[];
    try {
      const list = await pb.collection("leave_requests").getFullList({
        filter: `user="${pbEscape(userId)}" && (status="pending" || status="approved") && created >= "${start}" && created < "${nextStart}"`,
        requestKey: null,
      });
      leaves = list as unknown as LeaveRequest[];
    } catch {
      const all = await fetchPendingOrApprovedLeavesForUser(userId);
      const startMs = new Date(start).getTime();
      const endMs = new Date(nextStart).getTime();
      leaves = all.filter((lv) => {
        const c = new Date(lv.created).getTime();
        return !Number.isNaN(c) && c >= startMs && c < endMs;
      });
    }

    let monthLabel: string;
    try {
      monthLabel = new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
      }).format(ref);
    } catch {
      monthLabel = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
    }

    return {
      used: leaves.length,
      max: maxMonthly,
      monthLabel,
    };
  } catch (error) {
    console.error("Error getting monthly booking usage:", error);
    return {
      used: 0,
      max: maxMonthly,
      monthLabel: "",
    };
  }
}

/**
 * Check division quota for specific dates
 */
async function checkDivisionQuota(
  division: string,
  startDate: string,
  endDate: string,
  excludeUserId?: string
): Promise<{ success: boolean; blockedDates: string[] }> {
  try {
    const safeDiv = pbEscape(division);
    const maxPeople = await getDivisionQuota(division);
    const blockedDates: string[] = [];

    const dates = expandInclusiveDateRange(startDate, endDate);

    let records;
    try {
      records = await pb.collection("leave_requests").getFullList({
        filter: `division="${safeDiv}" && status="approved"`,
        sort: "-created",
        requestKey: null,
      });
    } catch {
      records = await pb.collection("leave_requests").getFullList({
        filter: `devision="${safeDiv}" && status="approved"`,
        sort: "-created",
        requestKey: null,
      });
    }
    const rows = normalizeLeaveRequestsFromPb(records as unknown[]);

    for (const date of dates) {
      let count = 0;
      for (const lv of rows) {
        if (
          excludeUserId &&
          leaveRequestUserId(lv as { user?: unknown }) === excludeUserId
        ) {
          continue;
        }
        const s = normalizeYmd(lv.start_date);
        const e = normalizeYmd(lv.end_date);
        if (s && e && s <= date && e >= date) count++;
      }
      if (count >= maxPeople) blockedDates.push(date);
    }

    return {
      success: blockedDates.length === 0,
      blockedDates,
    };
  } catch (error) {
    console.error("Error checking division quota:", error);
    return { success: false, blockedDates: [] };
  }
}

/**
 * Kirim pengajuan cuti (status **pending**; HR menyetujui di /hr/leave).
 */
export async function submitLeaveRequest(data: {
  userId: string;
  start_date: string;
  end_date: string;
  /** Opsional — jika kosong pakai DEFAULT_LEAVE_BOOKING_REASON */
  reason?: string;
}): Promise<{
  success: boolean;
  message: string;
  data?: LeaveRequest;
}> {
  try {
    console.log("📝 Booking leave request:", data);

    // Validation
    if (!data.userId) {
      return { success: false, message: "User not logged in" };
    }

    if (!data.start_date || !data.end_date) {
      return { success: false, message: "Tanggal mulai dan selesai wajib diisi" };
    }

    const reasonText =
      typeof data.reason === "string" && data.reason.trim().length > 0
        ? data.reason.trim()
        : DEFAULT_LEAVE_BOOKING_REASON;

    let profile;
    try {
      profile = await pb.collection("profiles").getFirstListItem(
        `user="${data.userId}"`,
        { requestKey: null }
      );
    } catch {
      return {
        success: false,
        message:
          "Profil karyawan tidak ditemukan di PocketBase. Hubungi HR agar profil Anda dibuat / disinkronkan.",
      };
    }

    const divisionKey = resolveProfileDivisionKey(
      profile as { division?: string; department?: string }
    );
    const positionClean = String(profile.position ?? "").trim();

    if (!divisionKey || !positionClean) {
      return {
        success: false,
        message:
          "Data profil belum lengkap: divisi atau departemen dan jabatan harus diisi di HR. Hubungi HR.",
      };
    }

    /** Bandingkan yyyy-MM-dd sebagai string — konsisten di semua zona waktu */
    const todayStr = todayYmdLocal();
    if (data.start_date < todayStr) {
      return { success: false, message: "Tanggal mulai tidak boleh di masa lalu" };
    }

    if (data.start_date > data.end_date) {
      return { success: false, message: "Tanggal mulai tidak boleh setelah tanggal selesai" };
    }

    const rangeDays = expandInclusiveDateRange(data.start_date, data.end_date);
    const days = rangeDays.length;

    // ✅ VALIDASI 1: Satu pengajuan = maks satu hari (kalender staff)
    if (days > MAX_DAYS_PER_BOOKING) {
      return {
        success: false,
        message: `Maksimal ${MAX_DAYS_PER_BOOKING} hari per booking. Anda memilih ${days} hari.`,
      };
    }

    // ✅ VALIDASI 2: Kuota pengajuan pending+approved per bulan kalender (per profil atau default)
    const monthlyUsage = await getMonthlyBookingUsage(data.userId);

    if (monthlyUsage.used >= monthlyUsage.max) {
      return {
        success: false,
        message: `Kuota pengajuan bulan ini habis (${monthlyUsage.max}× per bulan). Batalkan pengajuan yang belum diproses / disetujui atau tunggu bulan depan.`,
      };
    }

    // ✅ VALIDASI 3: Tidak overlap dengan cuti Anda (pending atau approved)
    const overlapping = await checkOverlappingLeave(
      data.userId,
      data.start_date,
      data.end_date
    );

    if (overlapping) {
      return {
        success: false,
        message:
          "Periode ini bertabrakan dengan pengajuan atau cuti Anda yang lain. Pilih tanggal lain.",
      };
    }

    const noteLegacy =
      days > 1
        ? `${reasonText} | s.d. ${data.end_date} (${days} hari)`
        : reasonText;

    // ✅ CREATE: isi skema baru + skema lama PB (field `date` + `note` + `division`)
    const record = await pb.collection("leave_requests").create({
      user: data.userId,
      start_date: data.start_date,
      end_date: data.end_date,
      reason: reasonText,
      status: "pending",
      division: divisionKey,
      /** Skema lama beberapa instance PB memakai typo `devision` — kirim dua-duanya. */
      devision: divisionKey,
      position: positionClean,
      booking_date: new Date().toISOString(),
      date: data.start_date,
      note: noteLegacy,
    });

    let stored: Record<string, unknown> = record as unknown as Record<string, unknown>;
    try {
      stored = (await pb.collection("leave_requests").getOne(record.id, {
        requestKey: null,
      })) as unknown as Record<string, unknown>;
    } catch {
      /* pakai response create */
    }

    const savedBounds = pickLeaveDatesFromPbRecord(stored);
    if (
      !ymdFromUnknown(savedBounds.start_date) ||
      !ymdFromUnknown(savedBounds.end_date)
    ) {
      console.error(
        "[leave] create ok tapi tanggal tidak terbaca di server — cek field start_date/end_date & API rule Create:",
        stored
      );
      return {
        success: false,
        message:
          "Tanggal cuti tidak tersimpan. Di PocketBase: koleksi `leave_requests` harus punya field **`date`** (atau `start_date`/`end_date`) dan rule Create mengizinkan staff mengisinya.",
      };
    }

    console.log("✅ Leave request submitted (pending):", record.id);

    const updatedMonthly = await getMonthlyBookingUsage(data.userId);

    return {
      success: true,
      message: `Pengajuan cuti (${days} hari) terkirim & menunggu persetujuan HR. Pengajuan bulan ini: ${updatedMonthly.used}/${updatedMonthly.max}.`,
      data: normalizeLeaveRequestsFromPb([stored])[0] ?? (record as unknown as LeaveRequest),
    };
  } catch (error: unknown) {
    console.error("❌ Leave request error:", error);
    return {
      success: false,
      message: getErrorMessage(error, "Gagal booking cuti"),
    };
  }
}

/**
 * Check for overlapping leave requests (prevent double booking)
 */
async function checkOverlappingLeave(
  userId: string,
  start_date: string,
  end_date: string
): Promise<boolean> {
  try {
    const rows = await fetchPendingOrApprovedLeavesForUser(userId);
    return rows.some((lv) =>
      leaveRangesOverlap(lv.start_date, lv.end_date, start_date, end_date)
    );
  } catch {
    return false;
  }
}

async function overlapsOtherApprovedLeaves(
  userId: string,
  start_date: string,
  end_date: string,
  exceptRequestId: string
): Promise<boolean> {
  const rows = await fetchApprovedLeavesForUser(userId);
  return rows.some(
    (lv) =>
      lv.id !== exceptRequestId &&
      leaveRangesOverlap(lv.start_date, lv.end_date, start_date, end_date)
  );
}

/**
 * HR/Owner menyetujui pengajuan (pending → approved); memvalidasi kuota divisi & overlap cuti approved.
 */
export async function approveLeaveRequestByHr(requestId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const record = await pb.collection("leave_requests").getOne(requestId);

    if (record.status !== "pending") {
      return {
        success: false,
        message: "Hanya pengajuan berstatus Menunggu yang bisa disetujui.",
      };
    }

    const rawRec = record as unknown as Record<string, unknown>;
    const userId = leaveRequestUserId(record as { user?: unknown });
    const bounds = pickLeaveDatesFromPbRecord(rawRec);
    const divisionKey = String(rawRec.division ?? rawRec.devision ?? "").trim();
    const start = normalizeYmd(bounds.start_date);
    const end = normalizeYmd(bounds.end_date);

    if (!(userId && divisionKey)) {
      return { success: false, message: "Data pengajuan tidak lengkap." };
    }

    const quotaCheck = await checkDivisionQuota(
      divisionKey,
      start,
      end,
      userId
    );

    if (!quotaCheck.success) {
      if (quotaCheck.blockedDates.length === 0) {
        return {
          success: false,
          message:
            "Gagal memeriksa kuota divisi. Periksa koneksi atau rule PocketBase, lalu coba lagi.",
        };
      }
      const maxPeople = await getDivisionQuota(divisionKey);
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

    const overlap = await overlapsOtherApprovedLeaves(userId, start, end, requestId);
    if (overlap) {
      return {
        success: false,
        message:
          "Karyawan sudah punya cuti disetujui lain yang bertabrakan dengan tanggal ini.",
      };
    }

    await pb.collection("leave_requests").update(requestId, {
      status: "approved",
      ...buildHrActionPayload(),
    });

    return { success: true, message: "Pengajuan disetujui." };
  } catch (error: unknown) {
    return {
      success: false,
      message: getErrorMessage(error, "Gagal menyetujui pengajuan"),
    };
  }
}

/**
 * HR/Owner menolak pengajuan (pending → rejected).
 */
export async function rejectLeaveRequestByHr(
  requestId: string,
  options?: { reason?: string }
): Promise<{
  success: boolean;
  message: string;
}> {
  const reason = String(options?.reason ?? "").trim();
  if (reason.length < 5) {
    return {
      success: false,
      message: "Berikan alasan penolakan untuk staff (minimal 5 karakter).",
    };
  }

  try {
    const record = await pb.collection("leave_requests").getOne(requestId);

    if (record.status !== "pending") {
      return {
        success: false,
        message: "Hanya pengajuan Menunggu yang bisa ditolak.",
      };
    }

    const hrPayload = buildHrActionPayload();

    try {
      await pb.collection("leave_requests").update(requestId, {
        status: "rejected",
        rejection_reason: reason,
        ...hrPayload,
      });
    } catch {
      const baseNote = String((record as { note?: string }).note ?? "").trimEnd();
      const tag = `\n\n[Penolakan HR]: ${reason}`;
      await pb.collection("leave_requests").update(requestId, {
        status: "rejected",
        note: (baseNote + tag).trim(),
        ...hrPayload,
      });
    }

    return { success: true, message: "Pengajuan ditolak. Staff dapat membaca alasannya di riwayat cuti." };
  } catch (error: unknown) {
    return {
      success: false,
      message: getErrorMessage(error, "Gagal menolak pengajuan"),
    };
  }
}

/** Awalan yyyy-MM-dd dari nilai tanggal apa pun PocketBase kembalikan. */
function ymdFromUnknown(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : "";
}

/** Tanggal akhir dari teks catatan legacy: `"... | s.d. YYYY-MM-DD ..."` */
function parseLegacyEndDateFromNote(note: unknown, startYmd: string): string | null {
  const n = String(note ?? "");
  const m = /\|\s*s\.d\.\s*(\d{4}-\d{2}-\d{2})/i.exec(n);
  if (!m?.[1]) return null;
  return m[1] >= startYmd ? m[1] : null;
}

/** Baca tanggal mulai/akhir dari record (nama field / skema lama bermacam-macam). */
function pickLeaveDatesFromPbRecord(raw: Record<string, unknown>): {
  start_date: string;
  end_date: string;
} {
  const legacy = raw.date ?? raw.Date;
  if (legacy !== undefined && legacy !== null && String(legacy).trim()) {
    const single = ymdFromUnknown(legacy);
    if (single) {
      const note = raw.note ?? raw.Note;
      const endNote = parseLegacyEndDateFromNote(note, single);
      if (endNote) return { start_date: single, end_date: endNote };
      return { start_date: single, end_date: single };
    }
  }
  const sd =
    raw.start_date ??
    raw.startDate ??
    raw["tanggal_mulai"];
  const ed =
    raw.end_date ??
    raw.endDate ??
    raw["tanggal_selesai"];
  const s = sd !== undefined && sd !== null ? String(sd) : "";
  const e = ed !== undefined && ed !== null ? String(ed) : "";

  const sy = ymdFromUnknown(s) || (s.trim() ? s : "");
  const ey = ymdFromUnknown(e) || (e.trim() ? e : "");
  return { start_date: sy, end_date: ey };
}

function stripHrRejectionSuffix(note: string): string {
  return note.replace(/\n\n\[Penolakan HR\]\s*:\s*[\s\S]*$/i, "").trim();
}

function pickStaffReasonFromRaw(raw: Record<string, unknown>): string {
  const r = String(raw.reason ?? "").trim();
  if (r) return r;
  return stripHrRejectionSuffix(String(raw.note ?? ""));
}

function pickRejectionReasonFromRaw(raw: Record<string, unknown>): string {
  const direct = String(
    raw.rejection_reason ?? raw.reject_reason ?? raw.hr_rejection_note ?? ""
  ).trim();
  if (direct) return direct;
  const n = String(raw.note ?? "");
  const m = /\n\n\[Penolakan HR\]\s*:\s*([\s\S]+)$/i.exec(n);
  return m ? m[1].trim() : "";
}

/**
 * true jika rentang cuti memotong satu hari apa pun dalam bulan kalender (month 1–12).
 */
export function leaveTouchesCalendarMonth(
  start: string,
  end: string,
  year: number,
  month: number
): boolean {
  const s = coerceLeaveYmd(start);
  const e = coerceLeaveYmd(end);
  if (!s || !e) return false;
  const first = new Date(year, month - 1, 1, 12, 0, 0, 0).getTime();
  const last = new Date(year, month, 0, 12, 0, 0, 0).getTime();
  const sMs = new Date(`${s}T12:00:00`).getTime();
  const eMs = new Date(`${e}T12:00:00`).getTime();
  return sMs <= last && eMs >= first;
}

/**
 * Get user's leave history
 */
export async function getLeaveHistory(
  userId: string,
  page = 1,
  perPage = 20
): Promise<{
  items: LeaveRequest[];
  totalPages: number;
}> {
  try {
    const result = await pb.collection("leave_requests").getList(page, perPage, {
      filter: `user="${pbEscape(userId)}"`,
      sort: "-created",
      requestKey: null,
    });

    const items = (result.items as Record<string, unknown>[]).map((raw) => {
      const lv = raw as unknown as LeaveRequest;
      const bounds = pickLeaveDatesFromPbRecord(raw);
      const div =
        raw.division ?? raw["Division"] ?? raw["devision"] ?? "";
      return {
        ...lv,
        start_date: bounds.start_date,
        end_date: bounds.end_date,
        division: String(div ?? "").trim(),
        reason: pickStaffReasonFromRaw(raw),
        rejection_reason: pickRejectionReasonFromRaw(raw),
      };
    }) as LeaveRequest[];

    return {
      items,
      totalPages: result.totalPages,
    };
  } catch (error) {
    console.error("Failed to fetch leave history:", error);
    return { items: [], totalPages: 0 };
  }
}

/** Selisih hari kalender lokal: (tanggal mulai cuti) − hari ini. 0 = mulai hari ini, 1 = besok, dst. */
export function calendarDaysFromTodayUntilLeaveStart(startYmdRaw: unknown): number | null {
  const ymd = ymdFromUnknown(String(startYmdRaw ?? ""));
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!dm) return null;
  const start = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Apakah staff boleh membatalkan dari aplikasi:
 * — **pending**: mulai paling cepat besok (`≥ 1` hari ke depan);
 * — **approved** (ACC HR): paling cepat dua hari dari sekarang untuk masih bisa batal di H–2 atau lebih (`≥ 2`; di H−1 atau hari H tidak lagi).
 */
export function canStaffCancelLeaveLocally(
  status: LeaveRequestStatus,
  start_date: string
): boolean {
  const d = calendarDaysFromTodayUntilLeaveStart(start_date);
  if (d === null) return false;
  if (status === "approved") return d >= 2;
  if (status === "pending") return d >= 1;
  return false;
}

/**
 * Batalkan pengajuan (pending) atau cuti yang disetujui sebelum tanggal mulai.
 */
export async function cancelLeaveRequest(
  requestId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const record = await pb.collection("leave_requests").getOne(requestId);

    if (
      record.status === "cancelled" ||
      record.status === "rejected"
    ) {
      return {
        success: false,
        message: "Pengajuan ini tidak aktif lagi.",
      };
    }

    if (record.status !== "pending" && record.status !== "approved") {
      return {
        success: false,
        message: "Status ini tidak bisa dibatalkan dari aplikasi.",
      };
    }

    const bounds = pickLeaveDatesFromPbRecord(
      record as unknown as Record<string, unknown>
    );
    const ymd = ymdFromUnknown(bounds.start_date);

    const daysAhead = calendarDaysFromTodayUntilLeaveStart(ymd);
    if (daysAhead === null) {
      return {
        success: false,
        message: "Data tanggal pengajuan tidak valid di server.",
      };
    }

    if (record.status === "pending") {
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

    if (record.status === "approved") {
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

    await pb.collection("leave_requests").update(requestId, {
      status: "cancelled",
    });

    return {
      success: true,
      message:
        record.status === "pending"
          ? "Pengajuan berhasil dibatalkan."
          : "Cuti yang disetujui berhasil dibatalkan.",
    };
  } catch (error: unknown) {
    return {
      success: false,
      message: getErrorMessage(error, "Gagal membatalkan cuti"),
    };
  }
}

/**
 * Get division availability for date range
 */
export async function getDivisionAvailability(
  division: string,
  startDate: string,
  endDate: string
): Promise<{
  available: boolean;
  blockedDates: string[];
  maxPeople: number;
}> {
  const maxPeople = await getDivisionQuota(division);
  const quotaCheck = await checkDivisionQuota(division, startDate, endDate);

  return {
    available: quotaCheck.success,
    blockedDates: quotaCheck.blockedDates,
    maxPeople,
  };
}

/** Awalan yyyy-MM-dd dari PocketBase (`date`/datetime/`undefined`). */
export function coerceLeaveYmd(raw: unknown): string {
  return ymdFromUnknown(raw);
}

function localDateFromYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format date range for display
 */
export function formatDateRange(start: string, end: string): string {
  const s = coerceLeaveYmd(start);
  const e = coerceLeaveYmd(end);
  const startDate = localDateFromYmd(s);
  const endDate = localDateFromYmd(e);

  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };

  if (!startDate || !endDate) return "—";

  if (s === e) {
    return startDate.toLocaleDateString("id-ID", options);
  }

  return `${startDate.toLocaleDateString("id-ID", options)} - ${endDate.toLocaleDateString("id-ID", options)}`;
}

/**
 * Tanggal selesai (yyyy-MM-dd) untuk cuti **berurutan** sebanyak `durationDays` hari kalender,
 * dimulai `startISO` (satu hari = tanggal mulai saja). Pakai kalender lokal (sama seperti input date).
 */
/** Tanggal lokal yyyy-MM-dd (untuk konsistensi input & kalender). */
export function toYmdLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayYmdLocal(): string {
  return toYmdLocalDate(new Date());
}

/** Ambil awalan yyyy-MM-dd dari nilai PocketBase (datetime/dates). */
function normalizeYmd(raw: string): string {
  const s = String(raw).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : s.slice(0, 10);
}

function leaveRequestUserId(lv: { user?: unknown }): string {
  const u = lv.user;
  if (u && typeof u === "object" && u !== null && "id" in u) {
    return String((u as { id: string }).id);
  }
  return String(u ?? "");
}

/** Samakan record PB (`date`, `note`, `devision`, …) ke `LeaveRequest` — dipakai UI HR dll. */
export function normalizeLeaveRequestsFromPb(items: unknown[]): LeaveRequest[] {
  return items.map((row) => {
    const raw = row as Record<string, unknown>;
    const bounds = pickLeaveDatesFromPbRecord(raw);
    const base = raw as unknown as LeaveRequest;
    return {
      ...base,
      id: String(raw.id ?? ""),
      user: leaveRequestUserId(raw as { user?: unknown }),
      start_date: bounds.start_date,
      end_date: bounds.end_date,
      reason: pickStaffReasonFromRaw(raw),
      rejection_reason: pickRejectionReasonFromRaw(raw),
      division: String(raw.division ?? raw.devision ?? "").trim(),
      position: String(raw.position ?? "").trim(),
      status: ((raw.status as LeaveRequestStatus) ?? "pending") as LeaveRequestStatus,
      booking_date: String(raw.booking_date ?? ""),
      created: String(raw.created ?? ""),
      updated: String(raw.updated ?? ""),
      hr_action_by: String(raw[HR_ACTION_BY_FIELD] ?? raw.hr_action_by ?? "").trim() || undefined,
      hr_action_name: String(raw[HR_ACTION_NAME_FIELD] ?? raw.hr_action_name ?? "").trim() || undefined,
      hr_action_at: String(raw[HR_ACTION_AT_FIELD] ?? raw.hr_action_at ?? "").trim() || undefined,
    };
  });
}

/** Dua rentang cuti overlap (tanggal yyyy-MM-dd) */
function leaveRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const s1 = normalizeYmd(aStart);
  const e1 = normalizeYmd(aEnd);
  const s2 = normalizeYmd(bStart);
  const e2 = normalizeYmd(bEnd);
  return s1 <= e2 && s2 <= e1;
}

/**
 * Cuti approved milik user — tanpa filter tanggal di query PocketBase.
 * Membandingkan field `date` di filter sering memicu 400 di beberapa skema PB.
 */
async function fetchApprovedLeavesForUser(userId: string): Promise<LeaveRequest[]> {
  if (!userId?.trim()) return [];
  const safe = pbEscape(userId);
  try {
    const list = await pb.collection("leave_requests").getFullList({
      filter: `user="${safe}" && status="approved"`,
      sort: "-created",
      requestKey: null,
    });
    return normalizeLeaveRequestsFromPb(list as unknown[]);
  } catch (err) {
    const code = err instanceof ClientResponseError ? err.status : undefined;
    const detail =
      err instanceof ClientResponseError
        ? err.response?.data
        : undefined;
    console.error(
      "[leave] fetchApprovedLeavesForUser:",
      code ?? "?",
      getErrorMessage(err, "fetch approved leaves"),
      detail
    );
    return [];
  }
}

/** Pending atau approved — untuk overlap & kalender & kuota bulanan (fallback). */
async function fetchPendingOrApprovedLeavesForUser(
  userId: string
): Promise<LeaveRequest[]> {
  if (!userId?.trim()) return [];
  const safe = pbEscape(userId);
  try {
    const list = await pb.collection("leave_requests").getFullList({
      filter: `user="${safe}" && (status="pending" || status="approved")`,
      sort: "-created",
      requestKey: null,
    });
    return normalizeLeaveRequestsFromPb(list as unknown[]);
  } catch (err) {
    console.error(
      "[leave] fetchPendingOrApprovedLeavesForUser:",
      err instanceof ClientResponseError ? err.status : "?",
      getErrorMessage(err, "fetch pending/approved leaves")
    );
    return [];
  }
}

/**
 * Semua tanggal dari start sampai end (inklusif), langkah per hari kalender lokal.
 */
export function expandInclusiveDateRange(startRaw: string, endRaw: string): string[] {
  const startStr = normalizeYmd(startRaw);
  const endStr = normalizeYmd(endRaw);
  const dates: string[] = [];
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startStr);
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endStr);
  if (!m1 || !m2) return dates;

  let cur = new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
  const end = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  if (cur > end) return dates;

  while (cur <= end) {
    dates.push(toYmdLocalDate(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return dates;
}

/** Pending + approved untuk bulan tersebut (kalender staff). */
export async function getApprovedLeavesOverlappingCalendarMonth(
  userId: string,
  year: number,
  monthIndex0: number
): Promise<LeaveRequest[]> {
  const lastDay = new Date(year, monthIndex0 + 1, 0);
  const firstStr = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
  const lastStr = toYmdLocalDate(lastDay);
  const rows = await fetchPendingOrApprovedLeavesForUser(userId);
  return rows.filter((lv) => {
    const s = normalizeYmd(lv.start_date);
    const e = normalizeYmd(lv.end_date);
    return s <= lastStr && e >= firstStr;
  });
}

/**
 * Snapshot satu bulan — **ringan**: hanya query cuti Anda (bukan seluruh divisi).
 * Hindari ratusan error 400 / lag; map divisi kosong — kuota divisi dicek saat HR menyetujui.
 */
export async function getLeaveCalendarMonthSnapshot(
  userId: string,
  divisionKey: string,
  year: number,
  monthIndex0: number
): Promise<{
  maxPeoplePerDay: number;
  divisionFullDates: string[];
  divisionPartialDates: string[];
  /** Disetujui (teal di kalender) */
  myBookedDates: string[];
  /** Menunggu HR (warna lain) */
  myPendingDates: string[];
}> {
  try {
    const maxPeople = divisionKey.trim()
      ? await getDivisionQuota(divisionKey)
      : DEFAULT_MAX_PEOPLE_PER_DAY;

    const lastDay = new Date(year, monthIndex0 + 1, 0);
    const firstStr = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
    const lastStr = toYmdLocalDate(lastDay);

    const myLeaves = await getApprovedLeavesOverlappingCalendarMonth(
      userId,
      year,
      monthIndex0
    );

    const myApproved = new Set<string>();
    const myPending = new Set<string>();

    for (const lv of myLeaves) {
      const bucket =
        lv.status === "approved"
          ? myApproved
          : lv.status === "pending"
            ? myPending
            : null;
      if (!bucket) continue;
      for (const d of expandInclusiveDateRange(lv.start_date, lv.end_date)) {
        if (d >= firstStr && d <= lastStr) bucket.add(d);
      }
    }

    return {
      maxPeoplePerDay: maxPeople,
      divisionFullDates: [],
      divisionPartialDates: [],
      myBookedDates: [...myApproved],
      myPendingDates: [...myPending],
    };
  } catch (error) {
    console.error("getLeaveCalendarMonthSnapshot:", error);
    return {
      maxPeoplePerDay: DEFAULT_MAX_PEOPLE_PER_DAY,
      divisionFullDates: [],
      divisionPartialDates: [],
      myBookedDates: [],
      myPendingDates: [],
    };
  }
}

export function inclusiveEndDateForDuration(
  startISO: string,
  durationDays: number
): string {
  const n = Math.floor(durationDays);
  const s = startISO.trim();
  if (!s || n < 1) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const end = new Date(y, mo - 1, d + n - 1);
  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, "0");
  const dd = String(end.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calculate number of days (inclusive start & end dates)
 */
export function calculateDays(start: string, end: string): number {
  const startDate = localDateFromYmd(coerceLeaveYmd(start));
  const endDate = localDateFromYmd(coerceLeaveYmd(end));
  if (!startDate || !endDate) return 0;
  if (endDate < startDate) return 0;
  const diffDays =
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) +
    1;
  return diffDays;
}

/**
 * Get max days per booking (constant)
 */
export function getMaxDaysPerBooking(): number {
  return MAX_DAYS_PER_BOOKING;
}

/**
 * Get max days per year (constant)
 */
export function getMaxDaysPerYear(): number {
  return MAX_DAYS_PER_YEAR;
}
