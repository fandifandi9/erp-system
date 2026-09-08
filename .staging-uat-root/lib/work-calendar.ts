/**
 * Jadwal kerja global + hari libur kantor (untuk hitung hari kerja wajib, alpha, bonus extra).
 * Default: Sen–Min operasional penuh (7 hari).
 */

import { pb } from "./pocketbase";

export const WORK_CALENDAR_SETTINGS_COLLECTION = "work_calendar_settings";
export const OFFICE_HOLIDAYS_COLLECTION = "office_holidays";

/** Index = Date.getDay() : 0=Minggu … 6=Sabtu */
export type WeekDayMask = [boolean, boolean, boolean, boolean, boolean, boolean, boolean];

const DAY_KEYS = [
  "work_sunday",
  "work_monday",
  "work_tuesday",
  "work_wednesday",
  "work_thursday",
  "work_friday",
  "work_saturday",
] as const;

/** Urutan tampilan HR: Sen–Minggu */
export const WORK_CALENDAR_DAY_ROWS: { key: (typeof DAY_KEYS)[number]; label: string }[] = [
  { key: "work_monday", label: "Senin" },
  { key: "work_tuesday", label: "Selasa" },
  { key: "work_wednesday", label: "Rabu" },
  { key: "work_thursday", label: "Kamis" },
  { key: "work_friday", label: "Jumat" },
  { key: "work_saturday", label: "Sabtu" },
  { key: "work_sunday", label: "Minggu" },
];

export const DEFAULT_WEEK_MASK: WeekDayMask = [true, true, true, true, true, true, true];

type Raw = Record<string, unknown>;

function toBool(v: unknown, fallback = true): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes"].includes(s)) return true;
    if (["false", "0", "no"].includes(s)) return false;
  }
  return fallback;
}

export function weekMaskFromRecord(raw: Raw | null | undefined): WeekDayMask {
  if (!raw) return [...DEFAULT_WEEK_MASK] as WeekDayMask;
  return DAY_KEYS.map((k, i) => {
    const v = raw[k];
    if (v === undefined || v === null) return DEFAULT_WEEK_MASK[i];
    return toBool(v, DEFAULT_WEEK_MASK[i]);
  }) as WeekDayMask;
}

/** Baca satu hari dari mask (field `work_monday` dll.). */
export function isWorkDayKeyEnabled(mask: WeekDayMask, key: (typeof DAY_KEYS)[number]): boolean {
  const i = DAY_KEYS.indexOf(key);
  return i >= 0 ? mask[i] : true;
}

export function ymdFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hitung hari kerja wajib antara dua tanggal (inklusif), sesuai mask & bukan libur. */
export function countScheduledWorkDays(
  startYmd: string,
  endYmd: string,
  mask: WeekDayMask,
  holidayDates: Set<string>
): number {
  const s = new Date(`${startYmd.slice(0, 10)}T12:00:00`);
  const e = new Date(`${endYmd.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  let count = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const ymd = ymdFromDate(d);
    if (holidayDates.has(ymd)) continue;
    const dow = d.getDay();
    if (mask[dow]) count += 1;
  }
  return count;
}

export async function fetchWorkCalendarMask(): Promise<WeekDayMask> {
  try {
    const row = await pb.collection(WORK_CALENDAR_SETTINGS_COLLECTION).getFirstListItem(
      "is_active=true",
      { requestKey: null }
    );
    return weekMaskFromRecord(row as unknown as Raw);
  } catch {
    try {
      const list = await pb.collection(WORK_CALENDAR_SETTINGS_COLLECTION).getList(1, 1, {
        sort: "-updated",
        requestKey: null,
      });
      const r = list.items[0];
      return weekMaskFromRecord(r ? (r as unknown as Raw) : null);
    } catch {
      return [...DEFAULT_WEEK_MASK] as WeekDayMask;
    }
  }
}

export async function fetchHolidayDatesInRange(startYmd: string, endYmd: string): Promise<Set<string>> {
  const start = startYmd.slice(0, 10);
  const end = endYmd.slice(0, 10);
  const set = new Set<string>();
  try {
    const rows = await pb.collection(OFFICE_HOLIDAYS_COLLECTION).getFullList({
      filter: `date >= "${start}" && date <= "${end}"`,
      requestKey: null,
    });
    for (const row of rows) {
      const d = String((row as Raw).date ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) set.add(d);
    }
  } catch {
    /* koleksi belum ada */
  }
  return set;
}

export function workCalendarSummary(mask: WeekDayMask): string {
  const labels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask[i]) parts.push(labels[i]);
  }
  return parts.length ? parts.join(", ") : "—";
}

/** Satu panggilan: mask + libur dalam rentang, lalu hitung hari kerja wajib. */
export async function countScheduledWorkDaysForRange(startYmd: string, endYmd: string): Promise<number> {
  const [mask, holidays] = await Promise.all([
    fetchWorkCalendarMask(),
    fetchHolidayDatesInRange(startYmd, endYmd),
  ]);
  return countScheduledWorkDays(startYmd, endYmd, mask, holidays);
}
