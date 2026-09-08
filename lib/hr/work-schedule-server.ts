/**
 * lib/hr/work-schedule-server.ts
 * Phase 33B — Server-authoritative work schedule mutations.
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import {
  assertCanAssignSchedule,
  assertCanViewEmployeeSchedule,
  assertNotSelfScheduleAssignment,
  assertScheduleCapability,
  datesOverlap,
} from "@/lib/hr/work-schedule-auth";
import {
  buildScheduleSnapshot,
  computeFinalizedMetrics,
  snapshotFromRecord,
} from "@/lib/hr/attendance-engine";
import { computeAttendanceMetrics } from "@/lib/hr/work-schedule-calc";
import { SCHEDULE_AUDIT_EVENTS, emitScheduleAuditEvent } from "@/lib/hr/work-schedule-audit";
import {
  resolveEmployeeDaySchedule,
  HR_EMPLOYEE_WORK_SCHEDULES,
  HR_WORK_SCHEDULE_DAYS,
  HR_WORK_SCHEDULES,
} from "@/lib/hr/work-schedule-resolve";
import {
  DEFAULT_WORK_TIMEZONE,
  WORK_SCHEDULE_TYPES,
  type ResolvedDaySchedule,
  type WeekdayIndex,
  type WorkScheduleType,
} from "@/lib/hr/work-schedule-types";
import { getTodayDate, type Profile } from "@/lib/attendance";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { assertScheduleCompanyScopeAsync } from "@/lib/hr/work-schedule-auth";

function pbEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function ymdOnly(v: unknown): string {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function parseScheduleType(v: unknown): WorkScheduleType {
  const s = String(v || "fixed").toLowerCase();
  return WORK_SCHEDULE_TYPES.includes(s as WorkScheduleType) ? (s as WorkScheduleType) : "fixed";
}

export async function serverListWorkSchedules(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  companyId?: string,
): Promise<Record<string, unknown>[]> {
  assertScheduleCapability(ctx, "schedule.view");
  const filters: string[] = ["is_active=true"];
  if (companyId) {
    await assertScheduleCompanyScopeAsync(adminPb, ctx, companyId);
    filters.push(`company="${pbEsc(companyId)}"`);
  } else if (!ctx.isOwner) {
    const operational = await getHrOperationalCompanyIds(adminPb, ctx);
    if (!operational.length) return [];
    const or = operational.map((id) => `company="${pbEsc(id)}"`).join(" || ");
    filters.push(`(${or})`);
  }
  try {
    return (await adminPb.collection(HR_WORK_SCHEDULES).getFullList({
      filter: filters.join(" && "),
      sort: "name",
      requestKey: null,
    })) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export async function serverCreateWorkSchedule(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    company: string;
    name: string;
    code?: string;
    schedule_type?: string;
    timezone?: string;
    effective_from?: string;
    effective_to?: string | null;
    late_grace_minutes?: number;
    early_leave_grace_minutes?: number;
    days?: Array<{
      weekday: number;
      start_time?: string;
      end_time?: string;
      break_start?: string;
      break_end?: string;
      is_working_day?: boolean;
    }>;
  },
): Promise<{ scheduleId: string }> {
  assertScheduleCapability(ctx, "schedule.create");
  await assertScheduleCompanyScopeAsync(adminPb, ctx, input.company);
  const name = String(input.name || "").trim();
  if (!name) throw new HrApiError("Nama jadwal wajib.", 400);

  const created = await adminPb.collection(HR_WORK_SCHEDULES).create({
    company: input.company,
    name,
    code: input.code?.trim() || name.toLowerCase().replace(/\s+/g, "-").slice(0, 32),
    schedule_type: parseScheduleType(input.schedule_type),
    timezone: input.timezone?.trim() || DEFAULT_WORK_TIMEZONE,
    effective_from: ymdOnly(input.effective_from) || getTodayDate(),
    effective_to: input.effective_to ? ymdOnly(input.effective_to) : null,
    is_active: true,
    late_grace_minutes: Math.max(0, Math.floor(Number(input.late_grace_minutes ?? 10))),
    early_leave_grace_minutes: Math.max(0, Math.floor(Number(input.early_leave_grace_minutes ?? 0))),
  });

  const scheduleId = String(created.id);
  const defaultDays: Array<{
    weekday: number;
    start_time: string;
    end_time: string;
    is_working_day: boolean;
    break_start?: string;
    break_end?: string;
  }> = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    start_time: "08:00",
    end_time: "17:00",
    is_working_day: true,
  }));

  const days = input.days?.length ? input.days : defaultDays;

  for (const day of days) {
    const wd = Math.min(6, Math.max(0, Math.floor(Number(day.weekday))));
    await adminPb.collection(HR_WORK_SCHEDULE_DAYS).create({
      schedule: scheduleId,
      weekday: wd,
      start_time: day.is_working_day === false ? null : day.start_time || "08:00",
      end_time: day.is_working_day === false ? null : day.end_time || "17:00",
      break_start: day.break_start || null,
      break_end: day.break_end || null,
      is_working_day: day.is_working_day !== false,
    });
  }

  await emitScheduleAuditEvent(adminPb, {
    event_code: SCHEDULE_AUDIT_EVENTS.CREATED,
    actor_id: ctx.userId,
    schedule_id: scheduleId,
    schedule_label: name,
    company_id: input.company,
    payload: { schedule_type: parseScheduleType(input.schedule_type) },
  });

  return { scheduleId };
}

export async function serverUpdateWorkSchedule(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  scheduleId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  assertScheduleCapability(ctx, "schedule.update");
  const existing = (await adminPb.collection(HR_WORK_SCHEDULES).getOne(scheduleId)) as Record<
    string,
    unknown
  >;
  await assertScheduleCompanyScopeAsync(adminPb, ctx, String(existing.company || ""));

  const body: Record<string, unknown> = {};
  if (patch.name != null) body.name = String(patch.name).trim();
  if (patch.code != null) body.code = String(patch.code).trim();
  if (patch.schedule_type != null) body.schedule_type = parseScheduleType(patch.schedule_type);
  if (patch.timezone != null) body.timezone = String(patch.timezone).trim();
  if (patch.effective_from != null) body.effective_from = ymdOnly(patch.effective_from);
  if (patch.effective_to !== undefined) {
    body.effective_to = patch.effective_to ? ymdOnly(patch.effective_to) : null;
  }
  if (patch.late_grace_minutes != null) {
    body.late_grace_minutes = Math.max(0, Math.floor(Number(patch.late_grace_minutes)));
  }
  if (patch.early_leave_grace_minutes != null) {
    body.early_leave_grace_minutes = Math.max(0, Math.floor(Number(patch.early_leave_grace_minutes)));
  }
  if (patch.is_active != null) body.is_active = Boolean(patch.is_active);

  await adminPb.collection(HR_WORK_SCHEDULES).update(scheduleId, body);

  await emitScheduleAuditEvent(adminPb, {
    event_code: SCHEDULE_AUDIT_EVENTS.UPDATED,
    actor_id: ctx.userId,
    schedule_id: scheduleId,
    schedule_label: String(existing.name || scheduleId),
    company_id: String(existing.company || ""),
    payload: { changed_fields: Object.keys(body) },
  });
}

export async function serverGetScheduleDays(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  scheduleId: string,
): Promise<Record<string, unknown>[]> {
  assertScheduleCapability(ctx, "schedule.view");
  const schedule = (await adminPb.collection(HR_WORK_SCHEDULES).getOne(scheduleId)) as Record<
    string,
    unknown
  >;
  await assertScheduleCompanyScopeAsync(adminPb, ctx, String(schedule.company || ""));
  return (await adminPb.collection(HR_WORK_SCHEDULE_DAYS).getFullList({
    filter: `schedule="${pbEsc(scheduleId)}"`,
    sort: "weekday",
    requestKey: null,
  })) as Record<string, unknown>[];
}

export async function serverUpdateScheduleDays(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  scheduleId: string,
  days: Array<{
    weekday: number;
    start_time?: string | null;
    end_time?: string | null;
    break_start?: string | null;
    break_end?: string | null;
    is_working_day?: boolean;
  }>,
): Promise<void> {
  assertScheduleCapability(ctx, "schedule.update");
  const schedule = (await adminPb.collection(HR_WORK_SCHEDULES).getOne(scheduleId)) as Record<
    string,
    unknown
  >;
  await assertScheduleCompanyScopeAsync(adminPb, ctx, String(schedule.company || ""));

  const existing = await adminPb.collection(HR_WORK_SCHEDULE_DAYS).getFullList({
    filter: `schedule="${pbEsc(scheduleId)}"`,
    requestKey: null,
  });
  const byWd = new Map(existing.map((r) => [Number((r as Record<string, unknown>).weekday), r]));

  for (const day of days) {
    const wd = Math.min(6, Math.max(0, Math.floor(Number(day.weekday)))) as WeekdayIndex;
    const payload = {
      schedule: scheduleId,
      weekday: wd,
      start_time: day.is_working_day === false ? null : day.start_time || null,
      end_time: day.is_working_day === false ? null : day.end_time || null,
      break_start: day.break_start || null,
      break_end: day.break_end || null,
      is_working_day: day.is_working_day !== false,
    };
    const row = byWd.get(wd);
    if (row) {
      await adminPb.collection(HR_WORK_SCHEDULE_DAYS).update(String(row.id), payload);
    } else {
      await adminPb.collection(HR_WORK_SCHEDULE_DAYS).create(payload);
    }
  }

  await emitScheduleAuditEvent(adminPb, {
    event_code: SCHEDULE_AUDIT_EVENTS.UPDATED,
    actor_id: ctx.userId,
    schedule_id: scheduleId,
    schedule_label: String(schedule.name || scheduleId),
    company_id: String(schedule.company || ""),
    payload: { changed_fields: ["days"] },
  });
}

export async function serverAssignWorkSchedule(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    userId: string;
    scheduleId: string;
    effective_from: string;
    effective_to?: string | null;
  },
): Promise<{ assignmentId: string }> {
  const schedule = (await adminPb.collection(HR_WORK_SCHEDULES).getOne(input.scheduleId)) as Record<
    string,
    unknown
  >;
  const companyId = String(schedule.company || "");
  await assertCanAssignSchedule(adminPb, ctx, input.userId, companyId);

  const from = ymdOnly(input.effective_from);
  if (!from) throw new HrApiError("effective_from wajib (YYYY-MM-DD).", 400);
  const to = input.effective_to ? ymdOnly(input.effective_to) : null;

  const existing = await adminPb.collection(HR_EMPLOYEE_WORK_SCHEDULES).getFullList({
    filter: `user="${pbEsc(input.userId)}" && is_active=true`,
    requestKey: null,
  });
  for (const row of existing) {
    const rec = row as Record<string, unknown>;
    const ef = ymdOnly(rec.effective_from);
    const et = rec.effective_to ? ymdOnly(rec.effective_to) : null;
    if (datesOverlap(from, to, ef, et)) {
      throw new HrApiError(
        "Penugasan jadwal bertumpuk dengan assignment aktif. Akhiri assignment lama terlebih dahulu.",
        400,
      );
    }
  }

  const created = await adminPb.collection(HR_EMPLOYEE_WORK_SCHEDULES).create({
    user: input.userId,
    schedule: input.scheduleId,
    effective_from: from,
    effective_to: to,
    is_active: true,
  });

  await emitScheduleAuditEvent(adminPb, {
    event_code: SCHEDULE_AUDIT_EVENTS.ASSIGNED,
    actor_id: ctx.userId,
    schedule_id: input.scheduleId,
    schedule_label: String(schedule.name || input.scheduleId),
    target_user_id: input.userId,
    company_id: companyId,
    payload: { effective_from: from, effective_to: to },
    severity: "success",
  });

  return { assignmentId: String(created.id) };
}

export async function serverEndWorkScheduleAssignment(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  assignmentId: string,
  effective_to?: string,
): Promise<void> {
  assertScheduleCapability(ctx, "schedule.assign");
  const row = (await adminPb.collection(HR_EMPLOYEE_WORK_SCHEDULES).getOne(
    assignmentId,
  )) as Record<string, unknown>;
  const targetUserId = String(row.user || "");
  assertNotSelfScheduleAssignment(ctx, targetUserId);

  const scheduleId = String(
    typeof row.schedule === "object" && row.schedule && "id" in row.schedule
      ? (row.schedule as { id: string }).id
      : row.schedule,
  );
  const schedule = (await adminPb.collection(HR_WORK_SCHEDULES).getOne(scheduleId)) as Record<
    string,
    unknown
  >;
  await assertScheduleCompanyScopeAsync(adminPb, ctx, String(schedule.company || ""));

  const endDate = ymdOnly(effective_to) || getTodayDate();
  await adminPb.collection(HR_EMPLOYEE_WORK_SCHEDULES).update(assignmentId, {
    effective_to: endDate,
    is_active: false,
  });

  await emitScheduleAuditEvent(adminPb, {
    event_code: SCHEDULE_AUDIT_EVENTS.ASSIGNMENT_ENDED,
    actor_id: ctx.userId,
    schedule_id: scheduleId,
    schedule_label: String(schedule.name || scheduleId),
    target_user_id: targetUserId,
    company_id: String(schedule.company || ""),
    payload: { effective_to: endDate, assignment_id: assignmentId },
    severity: "warning",
  });
}

export async function serverGetEmployeeScheduleContext(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId: string,
  businessYmd?: string,
  profile?: Profile | null,
): Promise<{
  schedule: ResolvedDaySchedule;
  metrics: ReturnType<typeof computeAttendanceMetrics> | null;
  assignments: Record<string, unknown>[];
}> {
  await assertCanViewEmployeeSchedule(adminPb, ctx, targetUserId);
  const ymd = businessYmd?.slice(0, 10) || getTodayDate();

  let prof = profile;
  if (!prof) {
    try {
      prof = (await adminPb.collection("profiles").getFirstListItem(
        `user="${pbEsc(targetUserId)}"`,
        { requestKey: null },
      )) as unknown as Profile;
    } catch {
      prof = null;
    }
  }

  const schedule = await resolveEmployeeDaySchedule(adminPb, targetUserId, ymd, prof);

  let assignments: Record<string, unknown>[] = [];
  try {
    assignments = (await adminPb.collection(HR_EMPLOYEE_WORK_SCHEDULES).getFullList({
      filter: `user="${pbEsc(targetUserId)}"`,
      sort: "-effective_from",
      requestKey: null,
    })) as Record<string, unknown>[];
  } catch {
    /* optional */
  }

  return { schedule, metrics: null, assignments };
}

export async function serverBuildTodayAttendanceContext(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  attendance: Record<string, unknown> | null,
  profile?: Profile | null,
): Promise<{
  schedule: ResolvedDaySchedule;
  metrics: ReturnType<typeof computeFinalizedMetrics>;
}> {
  const ymd = getTodayDate();
  const schedule = await resolveEmployeeDaySchedule(adminPb, ctx.userId, ymd, profile ?? null);

  if (attendance && attendance.schedule_source) {
    const snapshot = snapshotFromRecord(attendance);
    const metrics = computeFinalizedMetrics(
      snapshot,
      (attendance.check_in as string) || null,
      (attendance.check_out as string) || null,
      String(attendance.date || ymd).slice(0, 10),
    );
    return { schedule, metrics };
  }

  const metrics = computeFinalizedMetrics(
    buildScheduleSnapshot(schedule),
    (attendance?.check_in as string) || null,
    (attendance?.check_out as string) || null,
    ymd,
  );
  return { schedule, metrics };
}
