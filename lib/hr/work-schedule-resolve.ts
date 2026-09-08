/**
 * lib/hr/work-schedule-resolve.ts
 * Phase 33B — Resolve effective schedule for employee + business date.
 *
 * LEGACY COMPATIBILITY:
 * - Work Schedule assignment is source of truth when present.
 * - Profile shift_start/shift_end fields are fallback only (unchanged in PB).
 */

import type PocketBase from "pocketbase";
import {
  resolveProfileShiftForDate,
  resolveLateToleranceMinutes,
  type Profile,
} from "@/lib/attendance";
import {
  isOvernightShift,
  weekdayIndexFromYmd,
} from "@/lib/hr/work-schedule-calc";
import {
  DEFAULT_WORK_TIMEZONE,
  type ResolvedDaySchedule,
  type WeekdayIndex,
} from "@/lib/hr/work-schedule-types";

export const HR_WORK_SCHEDULES = "hr_work_schedules";
export const HR_WORK_SCHEDULE_DAYS = "hr_work_schedule_days";
export const HR_EMPLOYEE_WORK_SCHEDULES = "hr_employee_work_schedules";

function pbEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function ymdOnly(v: unknown): string {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export async function findActiveAssignmentForDate(
  adminPb: PocketBase,
  userId: string,
  businessYmd: string,
): Promise<Record<string, unknown> | null> {
  const uid = pbEsc(userId);
  const d = pbEsc(businessYmd);
  const filters = [
    `user="${uid}" && is_active=true && effective_from<="${d}" && (effective_to="" || effective_to=null || effective_to>="${d}")`,
    `user="${uid}" && is_active=true && effective_from<="${d}" && effective_to>="${d}"`,
    `user="${uid}" && is_active=true && effective_from<="${d}"`,
  ];
  for (const filter of filters) {
    try {
      const rows = await adminPb.collection(HR_EMPLOYEE_WORK_SCHEDULES).getFullList({
        filter,
        sort: "-effective_from,-created",
        requestKey: null,
      });
      if (!rows.length) continue;
      const active = rows.find((r) => {
        const rec = r as Record<string, unknown>;
        const from = ymdOnly(rec.effective_from);
        const to = ymdOnly(rec.effective_to);
        if (from && from > businessYmd) return false;
        if (to && to < businessYmd) return false;
        return rec.is_active !== false;
      });
      if (active) return active as Record<string, unknown>;
    } catch {
      /* collection may not exist yet */
    }
  }
  return null;
}

export async function resolveEmployeeDaySchedule(
  adminPb: PocketBase,
  userId: string,
  businessYmd: string,
  profile?: Profile | null,
): Promise<ResolvedDaySchedule> {
  const weekday = weekdayIndexFromYmd(businessYmd) as WeekdayIndex;
  const assignment = await findActiveAssignmentForDate(adminPb, userId, businessYmd);

  if (assignment?.schedule) {
    const scheduleId = String(
      typeof assignment.schedule === "object" && assignment.schedule && "id" in assignment.schedule
        ? (assignment.schedule as { id: string }).id
        : assignment.schedule,
    );
    try {
      const schedule = (await adminPb.collection(HR_WORK_SCHEDULES).getOne(scheduleId)) as Record<
        string,
        unknown
      >;
      const tz = String(schedule.timezone || DEFAULT_WORK_TIMEZONE);
      const lateGrace = Number(schedule.late_grace_minutes ?? 10);
      const earlyGrace = Number(schedule.early_leave_grace_minutes ?? 0);

      const dayRows = await adminPb.collection(HR_WORK_SCHEDULE_DAYS).getFullList({
        filter: `schedule="${pbEsc(scheduleId)}" && weekday=${weekday}`,
        requestKey: null,
      });
      const day = (dayRows[0] || {}) as Record<string, unknown>;
      const isWorking = day.is_working_day !== false;
      const startTime = day.start_time ? String(day.start_time).trim() : null;
      const endTime = day.end_time ? String(day.end_time).trim() : null;

      return {
        source: "work_schedule",
        scheduleId,
        scheduleName: String(schedule.name || schedule.code || scheduleId),
        businessDate: businessYmd,
        timezone: tz,
        isWorkingDay: isWorking,
        startTime: isWorking ? startTime : null,
        endTime: isWorking ? endTime : null,
        lateGraceMinutes: Number.isFinite(lateGrace) ? Math.max(0, lateGrace) : 10,
        earlyLeaveGraceMinutes: Number.isFinite(earlyGrace) ? Math.max(0, earlyGrace) : 0,
        isOvernight: startTime && endTime ? isOvernightShift(startTime, endTime) : false,
      };
    } catch {
      /* fall through to legacy */
    }
  }

  if (profile) {
    const legacy = resolveProfileShiftForDate(profile, businessYmd);
    const tol = resolveLateToleranceMinutes(profile);
    return {
      source: "profile_legacy",
      businessDate: businessYmd,
      timezone: DEFAULT_WORK_TIMEZONE,
      isWorkingDay: true,
      startTime: legacy.shiftStart,
      endTime: legacy.shiftEndDisplay,
      lateGraceMinutes: tol,
      earlyLeaveGraceMinutes: 0,
      isOvernight: isOvernightShift(legacy.shiftStart, legacy.shiftEndDisplay),
    };
  }

  return {
    source: "none",
    businessDate: businessYmd,
    timezone: DEFAULT_WORK_TIMEZONE,
    isWorkingDay: false,
    startTime: null,
    endTime: null,
    lateGraceMinutes: 0,
    earlyLeaveGraceMinutes: 0,
    isOvernight: false,
  };
}
