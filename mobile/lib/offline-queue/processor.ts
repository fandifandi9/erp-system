import { ClientResponseError } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { zoneCheckIn, zoneCheckOut } from "@/lib/inventory/api";
import {
  syncOperationalAccessAfterCheckIn,
  syncOperationalAccessAfterCheckOut,
} from "@/lib/operational-access-sync";
import type { OfflineQueueItem } from "./types";
import { OFFLINE_QUEUE_BASE_BACKOFF_MS, OFFLINE_QUEUE_MAX_RETRIES } from "./types";
import { loadQueueSnapshot, saveQueueSnapshot } from "./storage";

function pbEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function nextBackoffMs(retry: number): number {
  const exp = OFFLINE_QUEUE_BASE_BACKOFF_MS * Math.pow(2, Math.min(retry, 8));
  return Math.min(exp, 60_000);
}

function scheduleNextAttempt(item: OfflineQueueItem): OfflineQueueItem {
  const at = new Date(Date.now() + nextBackoffMs(item.retry_count)).toISOString();
  return { ...item, next_attempt_at: at };
}

async function processAttendanceCheckIn(item: OfflineQueueItem): Promise<void> {
  const userId = String(item.payload.user_id ?? "");
  const dateYmd = String(item.payload.date_ymd ?? "");
  const dataToSave = item.payload.dataToSave as Record<string, unknown> | undefined;
  if (!userId || !dateYmd || !dataToSave) throw new Error("Payload check-in tidak lengkap");

  const filter = `user="${pbEsc(userId)}" && date="${pbEsc(dateYmd)}"`;
  const existing = await pb.collection("attendance_logs").getFullList({
    filter,
    requestKey: null,
  });
  if (existing.some((r) => !!(r as { check_in?: string }).check_in)) {
    const op = await syncOperationalAccessAfterCheckIn(userId);
    if (!op.ok) console.warn("[offline-queue] skip dup check-in, sync akses:", op.error);
    return;
  }

  await pb.collection("attendance_logs").create(dataToSave, { requestKey: null });
  const op = await syncOperationalAccessAfterCheckIn(userId);
  if (!op.ok) console.warn("[offline-queue] check-in synced, akses:", op.error);
}

async function processAttendanceCheckOut(item: OfflineQueueItem): Promise<void> {
  const userId = String(item.payload.user_id ?? "");
  const recordId = String(item.payload.record_id ?? "");
  const checkOut = String(item.payload.check_out ?? "");
  const workHours = Number(item.payload.work_hours ?? 0);
  if (!recordId || !checkOut) throw new Error("Payload check-out tidak lengkap");

  try {
    const rec = await pb.collection("attendance_logs").getOne(recordId, { requestKey: null });
    if (rec.check_out) return;
    await pb.collection("attendance_logs").update(
      recordId,
      { check_out: checkOut, work_hours: workHours },
      { requestKey: null }
    );
  } catch (e: unknown) {
    const cr = e as ClientResponseError;
    if (cr?.status === 404) return;
    throw e;
  }
  if (userId) {
    const op = await syncOperationalAccessAfterCheckOut(userId);
    if (!op.ok) console.warn("[offline-queue] check-out synced, akses:", op.error);
  }
}

async function processZoneCheckIn(item: OfflineQueueItem): Promise<void> {
  const qr = item.payload.qr_payload != null ? String(item.payload.qr_payload) : undefined;
  const zoneId = item.payload.zone_id != null ? String(item.payload.zone_id) : undefined;
  await zoneCheckIn({ qr_payload: qr, zone_id: zoneId });
}

async function processZoneCheckOut(item: OfflineQueueItem): Promise<void> {
  const sessionId = item.payload.session_id != null ? String(item.payload.session_id) : undefined;
  await zoneCheckOut(sessionId);
}

/** Best-effort aktivitas staf — koleksi opsional di PocketBase. */
async function processStaffActivityStub(item: OfflineQueueItem): Promise<void> {
  const body = {
    ...item.payload,
    request_id: item.request_id,
    device_id: item.device_id,
    source: "mobile_offline_queue",
    queued_at: item.created_at,
  };
  try {
    await pb.collection("inv_staff_activities").create(body, { requestKey: null });
  } catch (e: unknown) {
    const cr = e as ClientResponseError;
    if (cr?.status === 404) return;
    throw e;
  }
}

export async function processOneItem(item: OfflineQueueItem): Promise<void> {
  switch (item.type) {
    case "attendance_checkin":
      await processAttendanceCheckIn(item);
      break;
    case "attendance_checkout":
      await processAttendanceCheckOut(item);
      break;
    case "inventory_zone_checkin":
      await processZoneCheckIn(item);
      break;
    case "inventory_zone_checkout":
      await processZoneCheckOut(item);
      break;
    case "opname_line":
    case "packing_scan":
    case "activity_metadata":
      await processStaffActivityStub(item);
      break;
    default:
      throw new Error(`Tipe antrean tidak dikenal: ${String((item as OfflineQueueItem).type)}`);
  }
}

export type DrainResult = { processed: number; remainingPending: number; failedDelta: number };

/**
 * Proses item pending yang sudah lewat jadwal backoff. Item sukses dihapus; gagal → retry atau failed.
 */
export async function drainOfflineQueue(opts?: { maxItems?: number }): Promise<DrainResult> {
  const max = opts?.maxItems ?? 8;
  const snap = await loadQueueSnapshot();
  const now = Date.now();
  let list = [...snap.items];
  let processed = 0;
  let failedDelta = 0;

  const pending = list.filter((i) => i.status === "pending");
  const due = pending
    .filter((i) => {
      if (!i.next_attempt_at) return true;
      return new Date(i.next_attempt_at).getTime() <= now;
    })
    .slice(0, max);

  for (const raw of due) {
    const idx = list.findIndex((x) => x.id === raw.id);
    if (idx < 0) continue;
    const item = list[idx];
    try {
      await processOneItem(item);
      list = list.filter((x) => x.id !== item.id);
      processed += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const nextRetry = item.retry_count + 1;
      if (nextRetry >= OFFLINE_QUEUE_MAX_RETRIES) {
        list[idx] = {
          ...item,
          status: "failed",
          retry_count: nextRetry,
          last_error: msg,
          next_attempt_at: undefined,
        };
        failedDelta += 1;
      } else {
        list[idx] = scheduleNextAttempt({
          ...item,
          retry_count: nextRetry,
          last_error: msg,
        });
      }
    }
  }

  await saveQueueSnapshot(list);
  return {
    processed,
    remainingPending: list.filter((i) => i.status === "pending").length,
    failedDelta,
  };
}

export async function peekQueueForUi(): Promise<OfflineQueueItem[]> {
  const snap = await loadQueueSnapshot();
  return snap.items;
}
