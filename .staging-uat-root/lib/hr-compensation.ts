/**
 * Pengaturan nominal HR/Owner: tarif lembur per jam & kompensasi cuti per hari.
 * Koleksi PocketBase: `hr_compensation_settings` (satu record aktif).
 */

import { pb } from "./pocketbase";
import { getErrorMessage } from "./errors";

export const HR_COMPENSATION_SETTINGS_COLLECTION = "hr_compensation_settings";

export interface HrCompensationSettings {
  id: string;
  name: string;
  /** Tarif dasar lembur per jam (Rp) — bisa dioverride per penunjukan/persetujuan. */
  overtime_hourly_rate: number;
  /** Pengali gaji lembur (mis. 1.5 = 150%). */
  overtime_multiplier: number;
  /** Nominal kompensasi cuti per hari kalender (Rp) — disnapshot saat HR approve. */
  leave_daily_compensation_rate: number;
}

type Raw = Record<string, unknown>;

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function mapSettings(raw: Raw): HrCompensationSettings {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "Default"),
    overtime_hourly_rate: Math.max(0, Math.round(toNumber(raw.overtime_hourly_rate, 0))),
    overtime_multiplier: Math.max(1, toNumber(raw.overtime_multiplier, 1)),
    leave_daily_compensation_rate: Math.max(
      0,
      Math.round(toNumber(raw.leave_daily_compensation_rate, 0))
    ),
  };
}

export function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
}

/** Hitung bayaran lembur: jam × tarif (pengali opsional, default 1 = tanpa overtime 1.5×). */
export function computeOvertimePayAmount(
  hours: number,
  hourlyRate: number,
  multiplier = 1
): number {
  const h = Math.max(0, hours);
  const rate = Math.max(0, hourlyRate);
  const mult = Math.max(1, multiplier);
  return Math.round(h * rate * mult);
}

/** Sederhana: tarif per jam × jumlah jam. */
export function computeOvertimePaySimple(hours: number, hourlyRate: number): number {
  return computeOvertimePayAmount(hours, hourlyRate, 1);
}

/** Hari cuti inklusif antara start–end (kalender). */
export function countLeaveCalendarDays(startYmd: string, endYmd: string): number {
  const s = String(startYmd ?? "").slice(0, 10);
  const e = String(endYmd ?? s).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return 0;
  const start = new Date(`${s}T12:00:00`);
  const end = new Date(`${e}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff + 1);
}

export function computeLeaveCompensationAmount(
  startYmd: string,
  endYmd: string,
  dailyRate: number
): number {
  const days = countLeaveCalendarDays(startYmd, endYmd);
  return Math.round(days * Math.max(0, dailyRate));
}

export async function fetchHrCompensationSettings(): Promise<HrCompensationSettings | null> {
  try {
    const active = await pb.collection(HR_COMPENSATION_SETTINGS_COLLECTION).getFirstListItem(
      "is_active=true",
      { requestKey: null }
    );
    return mapSettings(active as unknown as Raw);
  } catch {
    try {
      const list = await pb.collection(HR_COMPENSATION_SETTINGS_COLLECTION).getList(1, 1, {
        sort: "-updated",
        requestKey: null,
      });
      const row = list.items[0];
      return row ? mapSettings(row as unknown as Raw) : null;
    } catch {
      return null;
    }
  }
}

export async function saveHrCompensationSettings(input: {
  id?: string;
  overtime_hourly_rate: number;
  overtime_multiplier: number;
  leave_daily_compensation_rate: number;
  name?: string;
}): Promise<{ success: boolean; message: string; settings?: HrCompensationSettings }> {
  const payload = {
    name: input.name?.trim() || "Default",
    is_active: true,
    overtime_hourly_rate: Math.max(0, Math.round(input.overtime_hourly_rate)),
    overtime_multiplier: Math.max(1, input.overtime_multiplier),
    leave_daily_compensation_rate: Math.max(0, Math.round(input.leave_daily_compensation_rate)),
  };

  try {
    if (input.id) {
      const rec = await pb.collection(HR_COMPENSATION_SETTINGS_COLLECTION).update(input.id, payload);
      return {
        success: true,
        message: "Pengaturan nominal disimpan.",
        settings: mapSettings(rec as unknown as Raw),
      };
    }
    const rec = await pb.collection(HR_COMPENSATION_SETTINGS_COLLECTION).create(payload);
    return {
      success: true,
      message: "Pengaturan nominal dibuat.",
      settings: mapSettings(rec as unknown as Raw),
    };
  } catch (e: unknown) {
    return {
      success: false,
      message: getErrorMessage(
        e,
        "Gagal menyimpan. Buat koleksi hr_compensation_settings di PocketBase (lihat pocketbase_migration.json)."
      ),
    };
  }
}

/** Cuti yang jatuh pada tanggal tertentu (satu hari kalender). */
export async function fetchApprovedLeavesOnDate(
  dateYmd: string
): Promise<
  Array<{
    id: string;
    user: string;
    userName: string;
    division: string;
    start_date: string;
    end_date: string;
    daily_rate: number;
    compensation_amount: number;
    reason: string;
  }>
> {
  const d = String(dateYmd ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return [];

  try {
    const rows = await pb.collection("leave_requests").getFullList({
      filter: `status="approved" && start_date <= "${d}" && end_date >= "${d}"`,
      sort: "start_date",
      expand: "user",
      requestKey: null,
    });

    return rows.map((row) => {
      const r = row as unknown as Raw;
      const exp = (r.expand as Raw | undefined)?.user as Raw | undefined;
      const start = String(r.start_date ?? "").slice(0, 10);
      const end = String(r.end_date ?? start).slice(0, 10);
      const daily = Math.round(toNumber(r.daily_compensation_rate, 0));
      const stored = Math.round(toNumber(r.compensation_amount, 0));
      const days = countLeaveCalendarDays(start, end);
      const perDay = days > 0 && stored > 0 ? Math.round(stored / days) : daily;
      return {
        id: String(r.id ?? ""),
        user: String(r.user ?? ""),
        userName: String(exp?.name ?? exp?.email ?? r.user ?? "-"),
        division: String(r.division ?? r.devision ?? "-"),
        start_date: start,
        end_date: end,
        daily_rate: perDay,
        compensation_amount: stored,
        reason: String(r.reason ?? "").trim(),
      };
    });
  } catch {
    return [];
  }
}
