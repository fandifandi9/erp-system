/**
 * lib/hr/work-schedule-types.ts
 * Phase 33B — Work schedule domain types.
 */

export const WORK_SCHEDULE_TYPES = ["fixed", "shift"] as const;
export type WorkScheduleType = (typeof WORK_SCHEDULE_TYPES)[number];

/** 0 = Sunday … 6 = Saturday (matches JavaScript Date#getDay). */
export const WEEKDAY_LABELS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DEFAULT_WORK_TIMEZONE = "Asia/Jakarta";

export type WorkScheduleRecord = {
  id: string;
  company: string;
  name: string;
  code?: string;
  schedule_type: WorkScheduleType;
  timezone: string;
  effective_from?: string;
  effective_to?: string | null;
  is_active?: boolean;
  late_grace_minutes?: number;
  early_leave_grace_minutes?: number;
};

export type WorkScheduleDayRecord = {
  id?: string;
  schedule: string;
  weekday: WeekdayIndex;
  start_time?: string | null;
  end_time?: string | null;
  break_start?: string | null;
  break_end?: string | null;
  is_working_day?: boolean;
};

export type EmployeeWorkScheduleRecord = {
  id: string;
  user: string;
  schedule: string;
  effective_from: string;
  effective_to?: string | null;
  is_active?: boolean;
};

export type ResolvedDaySchedule = {
  source: "work_schedule" | "profile_legacy" | "none";
  scheduleId?: string;
  scheduleName?: string;
  businessDate: string;
  timezone: string;
  isWorkingDay: boolean;
  startTime: string | null;
  endTime: string | null;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
  isOvernight: boolean;
};

export type AttendanceMetrics = {
  status: "present" | "late" | "off_day" | "schedule_not_assigned" | "incomplete";
  scheduledDurationMinutes: number;
  actualDurationMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  isOvernight: boolean;
  businessDate: string;
};
