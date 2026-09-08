import type PocketBase from "pocketbase";
import { notifyUserInApp } from "@/lib/tenant/notify-user";
import type { ExceptionStatus, ExceptionType } from "@/lib/core/expected-actual";

export type TransactionExceptionNotifyInput = {
  userId: string;
  eventCode: string;
  module: "sales" | "purchase" | "warehouse";
  entityType: string;
  entityId: string;
  entityLabel: string;
  actionUrl: string;
  actorId: string;
  warehouseId?: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
  exceptionType?: ExceptionType;
  reasons?: string[];
};

/** Notifikasi bisnis hanya saat Expected != Actual (exception). */
export async function notifyBusinessException(
  pb: PocketBase,
  input: TransactionExceptionNotifyInput,
): Promise<void> {
  await notifyUserInApp(pb, {
    userId: input.userId,
    event_code: input.eventCode,
    module: input.module,
    severity: "warning",
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_label: input.entityLabel,
    warehouse_id: input.warehouseId,
    actor_id: input.actorId,
    payload: {
      action_url: input.actionUrl,
      exception_type: input.exceptionType,
      reasons: input.reasons,
      ...input.payload,
    },
    dedupe_key: input.dedupeKey,
  });
}

export function exceptionStatusForMatch(match: boolean): ExceptionStatus {
  return match ? "none" : "open";
}
