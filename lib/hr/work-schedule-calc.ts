/**
 * lib/hr/work-schedule-calc.ts
 * Phase 33B — Pure attendance schedule calculation (no DB).
 */

import type { AttendanceMetrics } from "@/lib/hr/work-schedule-types";
import { DEFAULT_WORK_TIMEZONE } from "@/lib/hr/work-schedule-types";

const HM_RE = /^(\d{1,2}):(\d{2})$/;

/** IANA timezone → fixed offset minutes east of UTC (Phase 33B: explicit, no server TZ). */
const TZ_OFFSET_MINUTES: Record<string, number> = {
  "Asia/Jakarta": 7 * 60,
  "Asia/Makassar": 8 * 60,
  "Asia/Jayapura": 9 * 60,
  UTC: 0,
};

export function parseHmToMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const m = String(hm).trim().match(HM_RE);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

export function formatMinutesAsHm(total: number): string {
  const t = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function getTimezoneOffsetMinutes(timezone: string): number {
  return TZ_OFFSET_MINUTES[timezone] ?? TZ_OFFSET_MINUTES[DEFAULT_WORK_TIMEZONE];
}

/** Wall-clock instant in schedule timezone → UTC epoch ms. */
export function zonedDateTimeToUtcMs(
  ymd: string,
  hm: string,
  timezone: string = DEFAULT_WORK_TIMEZONE,
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const mins = parseHmToMinutes(hm);
  if (mins === null) return null;
  const [y, mo, d] = ymd.split("-").map(Number);
  const offsetMin = getTimezoneOffsetMinutes(timezone);
  const utcMs = Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
  return utcMs + mins * 60_000 - offsetMin * 60_000;
}

export function isOvernightShift(startHm: string, endHm: string): boolean {
  const s = parseHmToMinutes(startHm);
  const e = parseHmToMinutes(endHm);
  if (s === null || e === null) return false;
  return e <= s;
}

export function scheduledEndBusinessDate(
  businessYmd: string,
  startHm: string,
  endHm: string,
): string {
  if (!isOvernightShift(startHm, endHm)) return businessYmd;
  const [y, mo, d] = businessYmd.split("-").map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

export type ComputeAttendanceInput = {
  businessDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualCheckIn: Date | string | null;
  actualCheckOut: Date | string | null;
  timezone?: string;
  lateGraceMinutes?: number;
  earlyLeaveGraceMinutes?: number;
  isWorkingDay?: boolean;
};

function toDate(v: Date | string | null): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeAttendanceMetrics(input: ComputeAttendanceInput): AttendanceMetrics {
  const tz = input.timezone || DEFAULT_WORK_TIMEZONE;
  const businessDate = input.businessDate.slice(0, 10);
  const isWorking = input.isWorkingDay !== false;

  if (!isWorking) {
    return {
      status: "off_day",
      scheduledDurationMinutes: 0,
      actualDurationMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      isOvernight: false,
      businessDate,
    };
  }

  const startHm = input.scheduledStart;
  const endHm = input.scheduledEnd;
  if (!startHm || !endHm) {
    return {
      status: "schedule_not_assigned",
      scheduledDurationMinutes: 0,
      actualDurationMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      isOvernight: false,
      businessDate,
    };
  }

  const overnight = isOvernightShift(startHm, endHm);
  const startMs = zonedDateTimeToUtcMs(businessDate, startHm, tz);
  const endYmd = scheduledEndBusinessDate(businessDate, startHm, endHm);
  const endMs = zonedDateTimeToUtcMs(endYmd, endHm, tz);

  if (startMs === null || endMs === null || endMs <= startMs) {
    return {
      status: "schedule_not_assigned",
      scheduledDurationMinutes: 0,
      actualDurationMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      isOvernight: overnight,
      businessDate,
    };
  }

  const scheduledDurationMinutes = Math.round((endMs - startMs) / 60_000);
  const lateGrace = Math.max(0, Math.floor(input.lateGraceMinutes ?? 0));
  const earlyGrace = Math.max(0, Math.floor(input.earlyLeaveGraceMinutes ?? 0));

  const checkIn = toDate(input.actualCheckIn);
  const checkOut = toDate(input.actualCheckOut);

  if (!checkIn) {
    return {
      status: "incomplete",
      scheduledDurationMinutes,
      actualDurationMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      isOvernight: overnight,
      businessDate,
    };
  }

  const checkInMs = checkIn.getTime();
  const rawLate = Math.max(0, Math.floor((checkInMs - startMs) / 60_000));
  const lateMinutes = rawLate <= lateGrace ? 0 : rawLate - lateGrace;
  const status: AttendanceMetrics["status"] = lateMinutes > 0 ? "late" : "present";

  let actualDurationMinutes = 0;
  let earlyLeaveMinutes = 0;
  /**
   * Lembur tidak dihitung dari checkout lewat jadwal.
   * OT hanya lewat pengajuan disetujui atau penunjukan HR (modul lembur).
   */
  const overtimeMinutes = 0;

  if (checkOut) {
    const checkOutMs = checkOut.getTime();
    actualDurationMinutes = Math.max(0, Math.round((checkOutMs - checkInMs) / 60_000));
    const rawEarly = Math.max(0, Math.floor((endMs - checkOutMs) / 60_000));
    earlyLeaveMinutes = rawEarly <= earlyGrace ? 0 : rawEarly - earlyGrace;
  }

  return {
    status,
    scheduledDurationMinutes,
    actualDurationMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    isOvernight: overnight,
    businessDate,
  };
}

/** Weekday index 0–6 from YYYY-MM-DD in schedule timezone (date-only, no DST for ID zones). */
export function weekdayIndexFromYmd(ymd: string): number {
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}
