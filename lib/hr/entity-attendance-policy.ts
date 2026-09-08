/**
 * Phase 34F — Entity attendance policy SSOT resolution.
 * Used by: staff policy API, payroll calculation, HR editor.
 */

import type PocketBase from "pocketbase";
import {
  type DeductionRates,
  type EntityAttendancePolicyDto,
} from "@/lib/hr/entity-attendance-policy-types";

export const HR_ENTITY_ATTENDANCE_POLICIES = "hr_entity_attendance_policies";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes"].includes(s)) return true;
    if (["false", "0", "no"].includes(s)) return false;
  }
  return fallback;
}

export function mapEntityAttendancePolicyRow(
  r: Record<string, unknown>,
  companyName?: string,
): EntityAttendancePolicyDto {
  return {
    id: String(r.id),
    company_id: String(r.company_id ?? "").trim() || undefined,
    company_name: companyName,
    status: String(r.status ?? "draft"),
    effective_from: String(r.effective_from ?? "").slice(0, 10),
    effective_until: String(r.effective_until ?? "").slice(0, 10) || undefined,
    late_enabled: toBool(r.late_enabled, true),
    late_grace_minutes: Math.max(0, Math.floor(toNum(r.late_grace_minutes, 0))),
    late_rate_per_minute: Math.max(0, Math.round(toNum(r.late_rate_per_minute, 0))),
    absence_enabled: toBool(r.absence_enabled, true),
    absence_rate_per_day: Math.max(0, Math.round(toNum(r.absence_rate_per_day, 0))),
    notes: String(r.notes ?? "").trim() || undefined,
    updated: String(r.updated ?? ""),
  };
}

export function policyToDeductionRates(p: EntityAttendancePolicyDto): DeductionRates {
  return {
    latePerMinute: p.late_rate_per_minute,
    absencePerDay: p.absence_rate_per_day,
    graceMinutes: p.late_grace_minutes,
    lateEnabled: p.late_enabled,
    absenceEnabled: p.absence_enabled,
    policyId: p.id,
    effectiveFrom: p.effective_from,
  };
}

/** Resolve published policy effective on asOfYmd for company (or global empty company_id). */
export async function resolveEffectiveEntityAttendancePolicy(
  pb: PocketBase,
  companyId: string | null | undefined,
  asOfYmd: string,
): Promise<EntityAttendancePolicyDto | null> {
  const date = asOfYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const companyFilter = companyId?.trim()
    ? `(company_id = "${pbEscape(companyId)}" || company_id = "" || company_id = null)`
    : `(company_id = "" || company_id = null)`;

  const rows = await pb.collection(HR_ENTITY_ATTENDANCE_POLICIES).getFullList({
    filter: `status = "published" && effective_from <= "${pbEscape(date)}" && ${companyFilter}`,
    sort: "-effective_from,-updated",
    requestKey: null,
  });

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const until = String(r.effective_until ?? "").slice(0, 10);
    if (until && until < date) continue;
    const cid = String(r.company_id ?? "").trim();
    if (cid && companyId && cid === companyId) {
      return mapEntityAttendancePolicyRow(r);
    }
  }

  // Prefer company-specific, then global
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const until = String(r.effective_until ?? "").slice(0, 10);
    if (until && until < date) continue;
    const cid = String(r.company_id ?? "").trim();
    if (!cid) return mapEntityAttendancePolicyRow(r);
  }

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const until = String(r.effective_until ?? "").slice(0, 10);
    if (until && until < date) continue;
    return mapEntityAttendancePolicyRow(r);
  }

  return null;
}

/** Payroll + staff UI: entity policy with optional per-employee HR override on profile. */
export async function resolveDeductionRatesForEmployee(
  pb: PocketBase,
  input: {
    companyId: string | null | undefined;
    asOfYmd: string;
    profileLateOverride?: number;
    profileAbsenceOverride?: number;
    baseSalary?: number;
  },
): Promise<DeductionRates> {
  const policy = await resolveEffectiveEntityAttendancePolicy(pb, input.companyId, input.asOfYmd);
  const baseSalary = Math.max(0, input.baseSalary ?? 0);
  const dailyFromSalary = baseSalary > 0 ? baseSalary / 30 : 0;
  const minuteFromSalary = dailyFromSalary > 0 ? dailyFromSalary / 8 / 60 : 0;

  if (policy) {
    const rates = policyToDeductionRates(policy);
    if (input.profileLateOverride != null && input.profileLateOverride > 0) {
      rates.latePerMinute = input.profileLateOverride;
    }
    if (input.profileAbsenceOverride != null && input.profileAbsenceOverride > 0) {
      rates.absencePerDay = input.profileAbsenceOverride;
    }
    return rates;
  }

  return {
    latePerMinute: input.profileLateOverride && input.profileLateOverride > 0 ? input.profileLateOverride : minuteFromSalary,
    absencePerDay:
      input.profileAbsenceOverride && input.profileAbsenceOverride > 0
        ? input.profileAbsenceOverride
        : dailyFromSalary,
    graceMinutes: 0,
    lateEnabled: true,
    absenceEnabled: true,
  };
}
