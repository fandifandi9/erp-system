import { getDeviceInfo } from "@/lib/device";
import type { OfflineQueueItem, OfflineQueueItemType } from "./types";
import { loadQueueSnapshot, saveQueueSnapshot } from "./storage";

let bump: (() => void) | null = null;

/** Dipasang dari context agar UI bisa refresh ringan. */
export function setOfflineQueueNotifier(fn: (() => void) | null) {
  bump = fn;
}

export function notifyOfflineQueueChanged() {
  bump?.();
}

function newRequestId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `rq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `rq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function newLocalId(): string {
  return newRequestId();
}

export type EnqueueInput = {
  type: OfflineQueueItemType;
  payload: Record<string, unknown>;
  idempotency_key: string;
};

/**
 * Tambahkan ke antrean. Jika sudah ada pending dengan idempotency_key sama, tidak duplikat.
 * @returns id item (baru atau yang sudah ada)
 */
export async function enqueueOfflineItem(input: EnqueueInput): Promise<string> {
  const snap = await loadQueueSnapshot();
  const existing = snap.items.find(
    (i) => i.idempotency_key === input.idempotency_key && i.status === "pending"
  );
  if (existing) {
    bump?.();
    return existing.id;
  }

  let device_id: string | undefined;
  try {
    const d = await getDeviceInfo();
    device_id = d.deviceId;
  } catch {
    /* ignore */
  }

  const item: OfflineQueueItem = {
    id: newLocalId(),
    type: input.type,
    payload: input.payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
    status: "pending",
    idempotency_key: input.idempotency_key,
    request_id: newRequestId(),
    device_id,
  };

  await saveQueueSnapshot([...snap.items, item]);
  bump?.();
  return item.id;
}
