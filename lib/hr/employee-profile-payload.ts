import { parseLeaveBookingsQuotaFromProfile, PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD } from "@/lib/leave";
import {
  PROFILE_ABSENCE_DEDUCTION_PER_DAY_FIELD,
  PROFILE_LATE_DEDUCTION_PER_MINUTE_FIELD,
  PROFILE_SHIFT_END_SATURDAY_FIELD,
  PROFILE_SHIFT_END_SUNDAY_FIELD,
  PROFILE_SHIFT_START_SATURDAY_FIELD,
  PROFILE_SHIFT_START_SUNDAY_FIELD,
} from "@/lib/profile";
import { formalizeTimeHmInput } from "@/lib/time-hm-input";

export type EmployeeProfileFormInput = {
  name: string;
  email: string;
  position?: string;
  department?: string;
  division?: string;
  salary_digits?: string;
  office_id: string;
  phone?: string;
  address?: string;
  nik?: string;
  npwp?: string;
  employee_code?: string;
  join_date?: string;
  leave_bookings_quota?: string;
  leave_daily_rate?: string;
  extra_bonus_amount?: string;
  extra_bonus_enabled?: boolean;
  late_deduction_per_minute?: string;
  absence_deduction_per_day?: string;
  late_tolerance?: string;
  shift_start?: string;
  shift_end?: string;
  shift_start_saturday?: string;
  shift_end_saturday?: string;
  shift_start_sunday?: string;
  shift_end_sunday?: string;
  require_checkin_selfie?: boolean;
};

export type EmployeeProfileValidationError =
  | "office_required"
  | "saturday_partial"
  | "sunday_partial";

/** Kosong di form → null di PocketBase (bukan 0 atau default). */
export function optionalStoredInt(raw: string | undefined): number | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
}

export function joinDateToPocketBase(raw: string | undefined): string | null {
  const d = String(raw ?? "").trim();
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return `${d}T12:00:00.000Z`;
  }
  return d;
}

export function validateEmployeeProfileForm(
  input: EmployeeProfileFormInput,
): EmployeeProfileValidationError | null {
  if (!String(input.office_id ?? "").trim()) return "office_required";

  const satStart = formalizeTimeHmInput(input.shift_start_saturday || "") || "";
  const satEnd = formalizeTimeHmInput(input.shift_end_saturday || "") || "";
  const sunStart = formalizeTimeHmInput(input.shift_start_sunday || "") || "";
  const sunEnd = formalizeTimeHmInput(input.shift_end_sunday || "") || "";

  const satPartial = Boolean(satStart || satEnd) && !(satStart && satEnd);
  const sunPartial = Boolean(sunStart || sunEnd) && !(sunStart && sunEnd);
  if (satPartial) return "saturday_partial";
  if (sunPartial) return "sunday_partial";

  return null;
}

export function buildEmployeeProfilePayload(
  input: EmployeeProfileFormInput,
): Record<string, unknown> {
  const shiftStartNorm = formalizeTimeHmInput(input.shift_start || "") || "";
  const shiftEndNorm = formalizeTimeHmInput(input.shift_end || "") || "";

  const satStart = formalizeTimeHmInput(input.shift_start_saturday || "") || "";
  const satEnd = formalizeTimeHmInput(input.shift_end_saturday || "") || "";
  const sunStart = formalizeTimeHmInput(input.shift_start_sunday || "") || "";
  const sunEnd = formalizeTimeHmInput(input.shift_end_sunday || "") || "";

  const quotaNum = parseLeaveBookingsQuotaFromProfile(input.leave_bookings_quota || "");

  return {
    name: input.name.trim(),
    email: input.email.trim(),
    position: input.position?.trim() || "",
    department: input.department?.trim() || "",
    division: input.division?.trim() || "",
    salary: optionalStoredInt(input.salary_digits),
    office_id: input.office_id,
    phone: input.phone?.trim() || "",
    address: input.address?.trim() || "",
    nik: input.nik?.trim() || "",
    npwp: input.npwp?.trim() || "",
    employee_code: input.employee_code?.trim() || "",
    profile_status: "complete",
    shift_start: shiftStartNorm,
    shift_end: shiftEndNorm,
    late_tolerance: optionalStoredInt(input.late_tolerance),
    join_date: joinDateToPocketBase(input.join_date),
    require_checkin_selfie: Boolean(input.require_checkin_selfie),
    [PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD]: quotaNum,
    leave_daily_rate: optionalStoredInt(input.leave_daily_rate),
    extra_bonus_amount: optionalStoredInt(input.extra_bonus_amount),
    extra_bonus_enabled: Boolean(input.extra_bonus_enabled),
    [PROFILE_LATE_DEDUCTION_PER_MINUTE_FIELD]: optionalStoredInt(input.late_deduction_per_minute),
    [PROFILE_ABSENCE_DEDUCTION_PER_DAY_FIELD]: optionalStoredInt(input.absence_deduction_per_day),
    [PROFILE_SHIFT_START_SATURDAY_FIELD]: satStart && satEnd ? satStart : "",
    [PROFILE_SHIFT_END_SATURDAY_FIELD]: satStart && satEnd ? satEnd : "",
    [PROFILE_SHIFT_START_SUNDAY_FIELD]: sunStart && sunEnd ? sunStart : "",
    [PROFILE_SHIFT_END_SUNDAY_FIELD]: sunStart && sunEnd ? sunEnd : "",
  };
}
