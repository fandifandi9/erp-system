/**
 * Phase 34E — Payslip privacy audit events (no salary amounts / file content).
 */

import type PocketBase from "pocketbase";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";

export const PAYSLIP_AUDIT_EVENTS = {
  VIEWED: "payslip.viewed",
  DOWNLOADED: "payslip.downloaded",
} as const;

export async function emitPayslipAuditEvent(
  adminPb: PocketBase,
  input: {
    event_code: string;
    actor_id: string;
    payroll_item_id: string;
    target_user_id: string;
    period_key?: string;
    company_id?: string;
  },
): Promise<void> {
  await emitBusinessEventServer(adminPb, {
    event_code: input.event_code,
    module: "finance",
    entity_type: "payroll_item",
    entity_id: input.payroll_item_id,
    entity_label: input.period_key || input.payroll_item_id,
    actor_id: input.actor_id,
    severity: "info",
    payload: {
      target_user_id: input.target_user_id,
      period_key: input.period_key,
      ...(input.company_id ? { company_id: input.company_id } : {}),
    },
  });
}
