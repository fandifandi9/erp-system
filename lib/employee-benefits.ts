/**
 * Manfaat per karyawan (profil): tarif cuti/hari, kuota cuti/bulan, bonus extra.
 * Field PocketBase di koleksi `profiles`.
 */

import { pb } from "./pocketbase";
import { formatIdr } from "./hr-compensation";
import {
  getMonthlyBookingUsage,
  resolveMaxBookingsPerMonthForUser,
  type MonthlyBookingInfo,
} from "./leave";
import {
  PROFILE_LEAVE_DAILY_RATE_FIELD,
  PROFILE_EXTRA_BONUS_AMOUNT_FIELD,
  PROFILE_EXTRA_BONUS_ENABLED_FIELD,
  resolveLeaveDailyRateForUser,
} from "./profile";
import { fetchExtraBonusPreviewForUser, type ExtraBonusEvaluation } from "./extra-bonus";

export {
  PROFILE_LEAVE_DAILY_RATE_FIELD,
  PROFILE_EXTRA_BONUS_AMOUNT_FIELD,
  PROFILE_EXTRA_BONUS_ENABLED_FIELD,
};

type Raw = Record<string, unknown>;

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

function pbEscape(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export interface StaffBenefitSummary {
  leaveDailyRate: number;
  leaveQuotaMax: number;
  leaveQuotaUsed: number;
  leaveQuotaRemaining: number;
  leaveQuotaMonthLabel: string;
  /** Estimasi kredit gaji jika sisa kuota tidak dipakai bulan ini. */
  leaveQuotaCreditEstimate: number;
  extraBonusEnabled: boolean;
  extraBonusAmount: number;
  extraBonusRuleText: string;
  extraBonus: ExtraBonusEvaluation;
}

export async function fetchProfileBenefitFields(userId: string): Promise<{
  leave_daily_rate: number;
  leave_bookings_quota: number;
  extra_bonus_amount: number;
  extra_bonus_enabled: boolean;
} | null> {
  if (!userId?.trim()) return null;
  try {
    const list = await pb.collection("profiles").getList(1, 1, {
      filter: `user="${pbEscape(userId)}"`,
      sort: "-updated",
      requestKey: null,
    });
    const prof = list.items[0] as unknown as Raw | undefined;
    if (!prof) return null;
    const maxQ = await resolveMaxBookingsPerMonthForUser(userId);
    return {
      leave_daily_rate: Math.max(0, Math.round(toNumber(prof[PROFILE_LEAVE_DAILY_RATE_FIELD], 0))),
      leave_bookings_quota: maxQ,
      extra_bonus_amount: Math.max(0, Math.round(toNumber(prof[PROFILE_EXTRA_BONUS_AMOUNT_FIELD], 0))),
      extra_bonus_enabled: toBool(prof[PROFILE_EXTRA_BONUS_ENABLED_FIELD], false),
    };
  } catch {
    return null;
  }
}

/** Kredit kuota cuti tidak terpakai untuk satu bulan kalender (by `created` pengajuan). */
export async function computeLeaveQuotaCreditForMonth(
  userId: string,
  year: number,
  month: number
): Promise<{ unusedSlots: number; dailyRate: number; amount: number }> {
  const ref = new Date(year, month - 1, 15, 12, 0, 0);
  const usage = await getMonthlyBookingUsage(userId, ref);
  const dailyRate = await resolveLeaveDailyRateForUser(userId);
  const unusedSlots = Math.max(0, usage.max - usage.used);
  return {
    unusedSlots,
    dailyRate,
    amount: Math.round(unusedSlots * dailyRate),
  };
}

/** Ringkasan untuk staff (kuota + nominal bulan berjalan). */
export async function fetchStaffBenefitSummary(userId: string): Promise<StaffBenefitSummary> {
  const usage: MonthlyBookingInfo = await getMonthlyBookingUsage(userId);
  const prof = await fetchProfileBenefitFields(userId);
  const dailyRate = await resolveLeaveDailyRateForUser(userId);
  const remaining = Math.max(0, usage.max - usage.used);
  const extraEnabled = prof?.extra_bonus_enabled ?? false;
  const extraAmount = prof?.extra_bonus_amount ?? 0;
  const extraBonus = await fetchExtraBonusPreviewForUser(userId, {
    enabled: extraEnabled,
    amount: extraAmount,
  });

  return {
    leaveDailyRate: dailyRate,
    leaveQuotaMax: usage.max,
    leaveQuotaUsed: usage.used,
    leaveQuotaRemaining: remaining,
    leaveQuotaMonthLabel: usage.monthLabel,
    leaveQuotaCreditEstimate: Math.round(remaining * dailyRate),
    extraBonusEnabled: extraEnabled,
    extraBonusAmount: extraAmount,
    extraBonusRuleText: extraBonus.reason,
    extraBonus,
  };
}

export { formatIdr };
