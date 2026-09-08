/**
 * lib/hr/employee-audit.ts
 * Phase 31 — Employee lifecycle audit events (metadata only — no secrets/sensitive values).
 */

import type PocketBase from "pocketbase";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";

export const EMPLOYEE_AUDIT_EVENTS = {
  CREATED: "employee.created",
  UPDATED: "employee.updated",
  ACTIVATED: "employee.activated",
  DEACTIVATED: "employee.deactivated",
  ROLE_CHANGED: "employee.role_changed",
  ACCESS_CHANGED: "employee.access_changed",
  MANAGER_CHANGED: "employee.manager_changed",
  SENSITIVE_DATA_CHANGED: "employee.sensitive_data_changed",
} as const;

export type EmployeeAuditEventCode =
  (typeof EMPLOYEE_AUDIT_EVENTS)[keyof typeof EMPLOYEE_AUDIT_EVENTS];

export type EmployeeAuditPayload = {
  target_user_id: string;
  target_profile_id?: string;
  target_label?: string;
  reason?: string;
  /** Field names only for sensitive changes — never values. */
  changed_fields?: string[];
  before_status?: string;
  after_status?: string;
  before_role_code?: string;
  after_role_code?: string;
  before_manager_id?: string | null;
  after_manager_id?: string | null;
};

export async function emitEmployeeAuditEvent(
  adminPb: PocketBase,
  input: {
    event_code: EmployeeAuditEventCode;
    actor_id: string;
    target_user_id: string;
    target_profile_id?: string;
    target_label?: string;
    payload?: Omit<EmployeeAuditPayload, "target_user_id" | "target_profile_id" | "target_label">;
    severity?: "info" | "success" | "warning";
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    target_user_id: input.target_user_id,
    ...(input.target_profile_id ? { target_profile_id: input.target_profile_id } : {}),
    ...(input.target_label ? { target_label: input.target_label } : {}),
    ...(input.payload || {}),
  };

  await emitBusinessEventServer(adminPb, {
    event_code: input.event_code,
    module: "hr",
    entity_type: "employee",
    entity_id: input.target_user_id,
    entity_label: input.target_label || input.target_user_id,
    actor_id: input.actor_id,
    severity: input.severity || "info",
    payload,
  });
}

/** Detect sensitive field names changed between before/after profile records. */
export function detectSensitiveFieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const sensitive = new Set([
    "nik",
    "npwp",
    "salary",
    "leave_daily_rate",
    "extra_bonus_amount",
    "extra_bonus_enabled",
    "late_deduction_rupiah_per_minute",
    "absence_deduction_rupiah_per_day",
  ]);
  const changed: string[] = [];
  for (const key of sensitive) {
    const b = before[key];
    const a = after[key];
    if (String(b ?? "") !== String(a ?? "")) changed.push(key);
  }
  return changed;
}
