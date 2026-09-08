/** Phase 34F — Structured entity attendance/payroll policy (SSOT types). */

export type EntityAttendancePolicyDto = {
  id: string;
  company_id?: string;
  company_name?: string;
  status: string;
  effective_from: string;
  effective_until?: string;
  late_enabled: boolean;
  late_grace_minutes: number;
  late_rate_per_minute: number;
  absence_enabled: boolean;
  absence_rate_per_day: number;
  notes?: string;
  updated?: string;
};

export type DeductionRates = {
  latePerMinute: number;
  absencePerDay: number;
  graceMinutes: number;
  lateEnabled: boolean;
  absenceEnabled: boolean;
  policyId?: string;
  effectiveFrom?: string;
};

export function formatRp(n: number): string {
  return `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
}

export function buildLateExampleText(rates: DeductionRates, exampleMinutes = 10): string {
  if (!rates.lateEnabled || rates.latePerMinute <= 0) {
    return "Potongan keterlambatan tidak aktif untuk kebijakan ini.";
  }
  const billable = Math.max(0, exampleMinutes - rates.graceMinutes);
  const amount = billable * rates.latePerMinute;
  const graceNote =
    rates.graceMinutes > 0
      ? ` (${rates.graceMinutes} menit toleransi tidak dipotong)`
      : "";
  return `${exampleMinutes} menit terlambat${graceNote} × ${formatRp(rates.latePerMinute)}/menit = ${formatRp(amount)}`;
}

export function buildAbsenceExampleText(rates: DeductionRates, days = 1): string {
  if (!rates.absenceEnabled || rates.absencePerDay <= 0) {
    return "Potongan ketidakhadiran tidak aktif untuk kebijakan ini.";
  }
  return `${days} hari alpha × ${formatRp(rates.absencePerDay)}/hari = ${formatRp(days * rates.absencePerDay)}`;
}

export type StaffAttendancePolicyView = {
  company_id?: string;
  company_name?: string;
  effective_from: string;
  effective_until?: string;
  updated?: string;
  late_enabled: boolean;
  late_grace_minutes: number;
  late_rate_per_minute: number;
  late_example: string;
  absence_enabled: boolean;
  absence_rate_per_day: number;
  absence_example: string;
  approved_leave_note: string;
  sick_leave_note: string;
  official_business_note: string;
};
