/**
 * Phase 34E — Employee document privacy audit (no file content / ID numbers).
 */

import type PocketBase from "pocketbase";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";

export const EMPLOYEE_DOCUMENT_AUDIT_EVENTS = {
  UPLOADED: "employee_document.uploaded",
  VIEWED: "employee_document.viewed",
  DOWNLOADED: "employee_document.downloaded",
  REPLACED: "employee_document.replaced",
} as const;

export async function emitEmployeeDocumentAuditEvent(
  adminPb: PocketBase,
  input: {
    event_code: string;
    actor_id: string;
    document_id: string;
    target_user_id: string;
    document_type: string;
  },
): Promise<void> {
  await emitBusinessEventServer(adminPb, {
    event_code: input.event_code,
    module: "hr",
    entity_type: "employee_document",
    entity_id: input.document_id,
    entity_label: input.document_type,
    actor_id: input.actor_id,
    severity: "info",
    payload: {
      target_user_id: input.target_user_id,
      document_type: input.document_type,
    },
  });
}
