/**
 * Phase 34B — Single authoritative attendance calculation engine.
 * All clients (mobile, desktop, API, reporting) must use this module.
 */
import type { ResolvedDaySchedule } from "@/lib/hr/work-schedule-types";
import {
  computeAttendanceMetrics,
  type ComputeAttendanceInput,
} from "@/lib/hr/work-schedule-calc";
import { calculateWorkHours } from "@/lib/attendance";

export type AttendanceScheduleSnapshot = {
  schedule_source: string;
  schedule_start: string;
  schedule_end: string;
  schedule_timezone: string;
  schedule_assignment_id: string;
  late_grace_minutes: number;
  early_leave_grace_minutes: number;
  is_working_day: boolean;
};

export function buildScheduleSnapshot(
  schedule: ResolvedDaySchedule | null | undefined,
): AttendanceScheduleSnapshot {
  if (!schedule) {
    return {
      schedule_source: "none",
      schedule_start: "",
      schedule_end: "",
      schedule_timezone: "Asia/Jakarta",
      schedule_assignment_id: "",
      late_grace_minutes: 0,
      early_leave_grace_minutes: 0,
      is_working_day: false,
    };
  }
  return {
    schedule_source: schedule.source,
    schedule_start: schedule.startTime || "",
    schedule_end: schedule.endTime || "",
    schedule_timezone: schedule.timezone,
    schedule_assignment_id: schedule.scheduleId || "",
    late_grace_minutes: schedule.lateGraceMinutes,
    early_leave_grace_minutes: schedule.earlyLeaveGraceMinutes,
    is_working_day: schedule.isWorkingDay,
  };
}

export function computeCheckInMetrics(
  schedule: ResolvedDaySchedule,
  checkIn: Date,
  businessYmd: string,
) {
  return computeAttendanceMetrics({
    businessDate: businessYmd,
    scheduledStart: schedule.startTime,
    scheduledEnd: schedule.endTime,
    actualCheckIn: checkIn,
    actualCheckOut: null,
    timezone: schedule.timezone,
    lateGraceMinutes: schedule.lateGraceMinutes,
    earlyLeaveGraceMinutes: schedule.earlyLeaveGraceMinutes,
    isWorkingDay: schedule.isWorkingDay,
  });
}

export function computeFinalizedMetrics(
  snapshot: AttendanceScheduleSnapshot,
  checkIn: string | Date | null,
  checkOut: string | Date | null,
  businessYmd: string,
) {
  const input: ComputeAttendanceInput = {
    businessDate: businessYmd,
    scheduledStart: snapshot.schedule_start || null,
    scheduledEnd: snapshot.schedule_end || null,
    actualCheckIn: checkIn,
    actualCheckOut: checkOut,
    timezone: snapshot.schedule_timezone,
    lateGraceMinutes: snapshot.late_grace_minutes,
    earlyLeaveGraceMinutes: snapshot.early_leave_grace_minutes,
    isWorkingDay: snapshot.is_working_day,
  };
  return computeAttendanceMetrics(input);
}

export function snapshotFromRecord(rec: Record<string, unknown>): AttendanceScheduleSnapshot {
  return {
    schedule_source: String(rec.schedule_source ?? "none"),
    schedule_start: String(rec.schedule_start ?? ""),
    schedule_end: String(rec.schedule_end ?? ""),
    schedule_timezone: String(rec.schedule_timezone ?? "Asia/Jakarta"),
    schedule_assignment_id: String(rec.schedule_assignment_id ?? ""),
    late_grace_minutes: Number(rec.late_grace_minutes) || 0,
    early_leave_grace_minutes: Number(rec.early_leave_grace_minutes) || 0,
    is_working_day: rec.is_working_day !== false,
  };
}

export function mapMetricsToPersistedFields(metrics: ReturnType<typeof computeAttendanceMetrics>) {
  const status =
    metrics.status === "late"
      ? "late"
      : metrics.status === "off_day" || metrics.status === "schedule_not_assigned"
        ? "present"
        : metrics.status === "incomplete"
          ? "present"
          : "present";

  return {
    status: status as "present" | "late",
    late_minutes: metrics.lateMinutes,
    early_leave_minutes: metrics.earlyLeaveMinutes,
    overtime_minutes: metrics.overtimeMinutes,
  };
}

export function computeWorkHoursFromIso(checkIn: string, checkOut: string): number {
  return calculateWorkHours(checkIn, checkOut);
}
