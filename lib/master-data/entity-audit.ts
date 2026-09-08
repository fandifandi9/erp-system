/**
 * Phase 34C — Legal Entity master audit events (no secrets / employee NIK/NPWP).
 */

import type PocketBase from "pocketbase";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";

export const ENTITY_AUDIT_EVENTS = {
  CREATED: "company.created",
  UPDATED: "company.updated",
  ACTIVATED: "company.activated",
  DEACTIVATED: "company.deactivated",
  ASSIGNED: "employee.company_assigned",
  REMOVED: "employee.company_removed",
  PRIMARY_CHANGED: "employee.primary_company_changed",
} as const;

export async function emitEntityAuditEvent(
  adminPb: PocketBase,
  input: {
    event_code: string;
    actor_id: string;
    entity_id: string;
    entity_label?: string;
    company_id?: string;
    payload?: Record<string, unknown>;
    severity?: "info" | "success" | "warning";
  },
): Promise<void> {
  await emitBusinessEventServer(adminPb, {
    event_code: input.event_code,
    module: "settings",
    entity_type: "legal_entity",
    entity_id: input.entity_id,
    entity_label: input.entity_label || input.entity_id,
    actor_id: input.actor_id,
    severity: input.severity || "info",
    payload: {
      ...(input.company_id ? { company_id: input.company_id } : {}),
      ...(input.payload || {}),
    },
  });
}
