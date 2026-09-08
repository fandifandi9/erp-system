import type PocketBase from "pocketbase";
import { emitBusinessEventServer } from "./activity-server";
import type { ActivityModule, ActivitySeverity } from "./types";

export type NotifyUserInput = {
  userId: string;
  event_code: string;
  module: ActivityModule;
  severity?: ActivitySeverity;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
  warehouse_id?: string;
  store_id?: string;
  payload?: Record<string, unknown>;
  dedupe_key?: string;
  actor_id?: string;
};

/** Notifikasi in-app ke user tertentu (payload.notify_user_id). */
export async function notifyUserInApp(
  pocket: PocketBase,
  input: NotifyUserInput,
): Promise<void> {
  if (!input.userId?.trim()) return;
  await emitBusinessEventServer(pocket, {
    event_code: input.event_code,
    severity: input.severity ?? "info",
    module: input.module,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    entity_label: input.entity_label,
    warehouse_id: input.warehouse_id,
    store_id: input.store_id,
    actor_id: input.actor_id,
    dedupe_key: input.dedupe_key,
    payload: {
      ...input.payload,
      notify_user_id: input.userId,
    },
  });
}

export function parseActivityNotifyUserId(payloadJson?: string | null): string | null {
  if (!payloadJson?.trim()) return null;
  try {
    const p = JSON.parse(payloadJson) as { notify_user_id?: string };
    return p.notify_user_id?.trim() || null;
  } catch {
    return null;
  }
}

export function activityEventForUser(
  payloadJson: string | undefined | null,
  userId: string,
): boolean {
  const target = parseActivityNotifyUserId(payloadJson);
  if (!target) return true;
  return target === userId;
}
