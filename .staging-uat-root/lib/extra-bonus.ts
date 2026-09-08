/**
 * Bonus extra: dihitung dari absensi bulan kalender saat gajian akhir bulan.
 * Syarat utama: full masuk tanpa alpha (tidak ada absen tanpa keterangan sah).
 */

import { pb } from "./pocketbase";
import { formatIdr } from "./hr-compensation";
import { countScheduledWorkDaysForRange } from "./work-calendar";

const PAYROLL_SETTINGS_COLLECTION = "payroll_settings";

type Raw = Record<string, unknown>;

export interface PayrollSettingLite {
  approved_leave_counts_as_presence: boolean;
  approved_field_activity_counts_as_presence: boolean;
  late_policy_enabled: boolean;
  max_late_days: number | null;
  max_late_minutes_total: number | null;
}

export interface MonthAttendanceSnapshot {
  year: number;
  month: number;
  monthLabel: string;
  rangeStart: string;
  rangeEnd: string;
  /** Hari kerja wajib (sesuai jadwal global & libur kantor) dalam rentang penilaian. */
  requiredWorkDays: number;
  presentDays: number;
  approvedLeaveDays: number;
  approvedFieldDays: number;
  lateDays: number;
  lateMinutes: number;
  eligiblePresence: number;
  /** Hari alpha = kerja wajib tanpa hadir sah (cuti/luar kantor jika dihitung). */
  alphaDays: number;
  /** Sampai tanggal berapa penilaian dihitung (hari ini jika bulan berjalan). */
  evaluatedThrough: string;
}

export interface ExtraBonusEvaluation {
  enabled: boolean;
  targetAmount: number;
  /** Estimasi cair di gajian jika syarat terpenuhi sampai akhir bulan. */
  estimatedAmount: number;
  /** Lolos syarat saat ini (bisa berubah sampai akhir bulan). */
  onTrack: boolean;
  status: "inactive" | "on_track" | "at_risk";
  statusLabel: string;
  reason: string;
  regulationBullets: string[];
  snapshot: MonthAttendanceSnapshot | null;
}

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toBool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
  }
  return fallback;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function overlapDays(startA: string, endA: string, startB: string, endB: string): number {
  const s = new Date(Math.max(new Date(`${startA}T12:00:00`).getTime(), new Date(`${startB}T12:00:00`).getTime()));
  const e = new Date(Math.min(new Date(`${endA}T12:00:00`).getTime(), new Date(`${endB}T12:00:00`).getTime()));
  if (e.getTime() < s.getTime()) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((e.getTime() - s.getTime()) / dayMs) + 1;
}

export function calendarMonthBounds(year: number, month: number): {
  start: string;
  end: string;
  monthLabel: string;
} {
  const start = ymd(new Date(year, month - 1, 1));
  const end = ymd(new Date(year, month, 0));
  let monthLabel: string;
  try {
    monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
      new Date(year, month - 1, 1)
    );
  } catch {
    monthLabel = `${month}/${year}`;
  }
  return { start, end, monthLabel };
}

export async function fetchPayrollSettingLite(): Promise<PayrollSettingLite | null> {
  const map = (raw: Raw): PayrollSettingLite => ({
    approved_leave_counts_as_presence: toBool(raw.approved_leave_counts_as_presence, true),
    approved_field_activity_counts_as_presence: toBool(
      raw.approved_field_activity_counts_as_presence,
      true
    ),
    late_policy_enabled: toBool(raw.late_policy_enabled, false),
    max_late_days: raw.max_late_days == null ? null : Math.max(0, Math.floor(toNumber(raw.max_late_days, 0))),
    max_late_minutes_total:
      raw.max_late_minutes_total == null
        ? null
        : Math.max(0, Math.floor(toNumber(raw.max_late_minutes_total, 0))),
  });

  try {
    const active = await pb.collection(PAYROLL_SETTINGS_COLLECTION).getFirstListItem("is_active=true", {
      requestKey: null,
    });
    return map(active as unknown as Raw);
  } catch {
    try {
      const list = await pb.collection(PAYROLL_SETTINGS_COLLECTION).getList(1, 1, {
        sort: "-updated",
        requestKey: null,
      });
      const row = list.items[0];
      return row ? map(row as unknown as Raw) : null;
    } catch {
      return null;
    }
  }
}

async function getApprovedLeaveDays(userId: string, startDate: string, endDate: string): Promise<number> {
  try {
    const rows = await pb.collection("leave_requests").getFullList({
      filter: `user="${userId}" && status="approved"`,
      requestKey: null,
    });
    let days = 0;
    for (const row of rows) {
      const rec = row as Raw;
      const s = String(rec.start_date ?? "").slice(0, 10);
      const e = String(rec.end_date ?? s).slice(0, 10);
      if (!s || !e) continue;
      days += overlapDays(s, e, startDate, endDate);
    }
    return days;
  } catch {
    return 0;
  }
}

async function getApprovedFieldDays(userId: string, startDate: string, endDate: string): Promise<number> {
  try {
    const rows = await pb.collection("field_activity_requests").getFullList({
      filter: `user="${userId}" && status="approved"`,
      requestKey: null,
    });
    let days = 0;
    for (const row of rows) {
      const rec = row as Raw;
      const s = String(rec.start_date ?? "").slice(0, 10);
      const e = String(rec.end_date ?? s).slice(0, 10);
      if (!s || !e) continue;
      days += overlapDays(s, e, startDate, endDate);
    }
    return days;
  } catch {
    return 0;
  }
}

async function getAttendanceStats(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ presentDays: number; lateDays: number; lateMinutes: number }> {
  try {
    const rows = await pb.collection("attendance_logs").getFullList({
      filter: `user="${userId}" && date >= "${startDate}" && date <= "${endDate}"`,
      requestKey: null,
    });
    let presentDays = 0;
    let lateDays = 0;
    let lateMinutes = 0;
    for (const row of rows) {
      const rec = row as Raw;
      const st = String(rec.status ?? "");
      if (st === "present" || st === "late") presentDays += 1;
      if (st === "late") lateDays += 1;
      lateMinutes += Math.max(0, Math.floor(toNumber(rec.late_minutes, 0)));
    }
    return { presentDays, lateDays, lateMinutes };
  } catch {
    return { presentDays: 0, lateDays: 0, lateMinutes: 0 };
  }
}

/** Snapshot absensi untuk satu bulan kalender; `throughToday` = penilaian sampai hari ini jika bulan berjalan. */
export async function buildMonthAttendanceSnapshot(
  userId: string,
  year: number,
  month: number,
  options?: { throughToday?: boolean }
): Promise<MonthAttendanceSnapshot> {
  const { start, end, monthLabel } = calendarMonthBounds(year, month);
  const today = ymd(new Date());
  const evaluatedThrough =
    options?.throughToday !== false && today >= start && today <= end ? today : end;

  const attendance = await getAttendanceStats(userId, start, evaluatedThrough);
  const approvedLeaveDays = await getApprovedLeaveDays(userId, start, evaluatedThrough);
  const approvedFieldDays = await getApprovedFieldDays(userId, start, evaluatedThrough);
  const requiredWorkDays = await countScheduledWorkDaysForRange(start, evaluatedThrough);

  const setting = await fetchPayrollSettingLite();
  const eligiblePresence =
    attendance.presentDays +
    (setting?.approved_leave_counts_as_presence !== false ? approvedLeaveDays : 0) +
    (setting?.approved_field_activity_counts_as_presence !== false ? approvedFieldDays : 0);

  const alphaDays = Math.max(0, requiredWorkDays - eligiblePresence);

  return {
    year,
    month,
    monthLabel,
    rangeStart: start,
    rangeEnd: end,
    requiredWorkDays,
    presentDays: attendance.presentDays,
    approvedLeaveDays,
    approvedFieldDays,
    lateDays: attendance.lateDays,
    lateMinutes: attendance.lateMinutes,
    eligiblePresence,
    alphaDays,
    evaluatedThrough,
  };
}

/** Penilaian bonus extra: wajib tanpa alpha; aturan telat mengikuti payroll_settings. */
export function evaluateExtraBonusEligibility(input: {
  snapshot: MonthAttendanceSnapshot;
  setting: PayrollSettingLite | null;
  targetAmount: number;
  enabled: boolean;
}): Omit<ExtraBonusEvaluation, "regulationBullets" | "snapshot"> & {
  regulationBullets: string[];
} {
  const { snapshot, setting, targetAmount, enabled } = input;
  const bullets = [
    "Bonus extra dihitung dari data absensi bulan kalender, diproses saat gajian akhir bulan.",
    "Hadir (check-in) + cuti disetujui + aktivitas luar disetujui (jika diatur sistem) dihitung memenuhi kehadiran.",
    "Alpha = hari kerja tanpa kehadiran sah. Bonus hanya cair jika tidak ada alpha dalam bulan tersebut.",
    "Jumlah hari kerja wajib mengikuti jadwal global perusahaan dan kalender libur kantor (pengaturan HR).",
    `Nominal target Anda: ${formatIdr(targetAmount)} (diatur HR per karyawan).`,
  ];

  if (!enabled || targetAmount <= 0) {
    return {
      enabled: false,
      targetAmount: 0,
      estimatedAmount: 0,
      onTrack: false,
      status: "inactive",
      statusLabel: "Tidak aktif",
      reason: "HR belum mengaktifkan bonus extra untuk akun Anda.",
      regulationBullets: bullets,
    };
  }

  if (snapshot.alphaDays > 0) {
    return {
      enabled: true,
      targetAmount,
      estimatedAmount: 0,
      onTrack: false,
      status: "at_risk",
      statusLabel: "Belum memenuhi",
      reason: `Ada ${snapshot.alphaDays} hari alpha (absen tanpa keterangan sah). Perbaiki kehadiran sampai akhir bulan.`,
      regulationBullets: bullets,
    };
  }

  if (setting?.late_policy_enabled) {
    if (setting.max_late_days != null && snapshot.lateDays > setting.max_late_days) {
      return {
        enabled: true,
        targetAmount,
        estimatedAmount: 0,
        onTrack: false,
        status: "at_risk",
        statusLabel: "Belum memenuhi",
        reason: `Telat ${snapshot.lateDays} hari (maks. ${setting.max_late_days} hari).`,
        regulationBullets: bullets,
      };
    }
    if (
      setting.max_late_minutes_total != null &&
      snapshot.lateMinutes > setting.max_late_minutes_total
    ) {
      return {
        enabled: true,
        targetAmount,
        estimatedAmount: 0,
        onTrack: false,
        status: "at_risk",
        statusLabel: "Belum memenuhi",
        reason: `Akumulasi telat ${snapshot.lateMinutes} menit (maks. ${setting.max_late_minutes_total} menit).`,
        regulationBullets: bullets,
      };
    }
  }

  return {
    enabled: true,
    targetAmount,
    estimatedAmount: targetAmount,
    onTrack: true,
    status: "on_track",
    statusLabel: "Memenuhi syarat",
    reason:
      "Full masuk tanpa alpha — estimasi bonus extra masuk slip gaji akhir bulan jika kondisi ini bertahan sampai tutup bulan.",
    regulationBullets: bullets,
  };
}

/** Snapshot untuk rentang tanggal (mis. periode payroll). */
export async function buildRangeAttendanceSnapshot(
  userId: string,
  startDate: string,
  endDate: string
): Promise<MonthAttendanceSnapshot> {
  const start = String(startDate).slice(0, 10);
  const end = String(endDate).slice(0, 10);
  const attendance = await getAttendanceStats(userId, start, end);
  const approvedLeaveDays = await getApprovedLeaveDays(userId, start, end);
  const approvedFieldDays = await getApprovedFieldDays(userId, start, end);
  const requiredWorkDays = await countScheduledWorkDaysForRange(start, end);
  const setting = await fetchPayrollSettingLite();
  const eligiblePresence =
    attendance.presentDays +
    (setting?.approved_leave_counts_as_presence !== false ? approvedLeaveDays : 0) +
    (setting?.approved_field_activity_counts_as_presence !== false ? approvedFieldDays : 0);
  const alphaDays = Math.max(0, requiredWorkDays - eligiblePresence);
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7));
  return {
    year: y,
    month: m,
    monthLabel: `${start} s/d ${end}`,
    rangeStart: start,
    rangeEnd: end,
    requiredWorkDays,
    presentDays: attendance.presentDays,
    approvedLeaveDays,
    approvedFieldDays,
    lateDays: attendance.lateDays,
    lateMinutes: attendance.lateMinutes,
    eligiblePresence,
    alphaDays,
    evaluatedThrough: end,
  };
}

export async function fetchExtraBonusPreviewForUser(
  userId: string,
  profile: { enabled: boolean; amount: number },
  referenceDate?: Date
): Promise<ExtraBonusEvaluation> {
  const ref = referenceDate ?? new Date();
  const year = ref.getFullYear();
  const month = ref.getMonth() + 1;
  const setting = await fetchPayrollSettingLite();
  const snapshot = await buildMonthAttendanceSnapshot(userId, year, month, { throughToday: true });
  const core = evaluateExtraBonusEligibility({
    snapshot,
    setting,
    targetAmount: profile.amount,
    enabled: profile.enabled,
  });
  return { ...core, snapshot, regulationBullets: core.regulationBullets };
}

export { formatIdr };
