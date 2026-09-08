/**
 * lib/hr/work-schedule-audit.ts
 * Phase 33B — Schedule audit events (metadata only).
 */

import type PocketBase from "pocketbase";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";

export const SCHEDULE_AUDIT_EVENTS = {
  CREATED: "schedule.created",
  UPDATED: "schedule.updated",
  ASSIGNED: "schedule.assigned",
  ASSIGNMENT_ENDED: "schedule.assignment_ended",
} as const;

export type ScheduleAuditEventCode =
  (typeof SCHEDULE_AUDIT_EVENTS)[keyof typeof SCHEDULE_AUDIT_EVENTS];

export async function emitScheduleAuditEvent(
  adminPb: PocketBase,
  input: {
    event_code: ScheduleAuditEventCode;
    actor_id: string;
    schedule_id?: string;
    schedule_label?: string;
    target_user_id?: string;
    company_id?: string;
    payload?: Record<string, unknown>;
    severity?: "info" | "success" | "warning";
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    ...(input.schedule_id ? { schedule_id: input.schedule_id } : {}),
    ...(input.target_user_id ? { target_user_id: input.target_user_id } : {}),
    ...(input.payload || {}),
  };

  await emitBusinessEventServer(adminPb, {
    event_code: input.event_code,
    module: "hr",
    entity_type: "work_schedule",
    entity_id: input.schedule_id || input.target_user_id || "schedule",
    entity_label: input.schedule_label || input.schedule_id || "schedule",
    actor_id: input.actor_id,
    severity: input.severity || "info",
    payload: {
      ...(input.company_id ? { company_id: input.company_id } : {}),
      ...payload,
    },
  });
}
