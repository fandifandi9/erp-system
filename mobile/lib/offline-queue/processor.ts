import { ClientResponseError } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { zoneCheckIn, zoneCheckOut, scanPackingMobile, submitOpnameLineMobile } from "@/lib/inventory/api";
import type { OfflineQueueItem } from "./types";
import { OFFLINE_QUEUE_BASE_BACKOFF_MS, OFFLINE_QUEUE_MAX_RETRIES } from "./types";
import { loadQueueSnapshot, saveQueueSnapshot } from "./storage";

function nextBackoffMs(retry: number): number {
  const exp = OFFLINE_QUEUE_BASE_BACKOFF_MS * Math.pow(2, Math.min(retry, 8));
  return Math.min(exp, 60_000);
}

function scheduleNextAttempt(item: OfflineQueueItem): OfflineQueueItem {
  const at = new Date(Date.now() + nextBackoffMs(item.retry_count)).toISOString();
  return { ...item, next_attempt_at: at };
}

/** Phase 11: offline attendance disabled — never replay to PocketBase. */
async function processAttendanceCheckIn(_item: OfflineQueueItem): Promise<void> {
  throw new Error(
    "Offline absensi dinonaktifkan. Hapus antrean absensi dan absen ulang saat online via API ERP.",
  );
}

async function processAttendanceCheckOut(_item: OfflineQueueItem): Promise<void> {
  throw new Error(
    "Offline absensi dinonaktifkan. Hapus antrean absensi dan absen ulang saat online via API ERP.",
  );
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

async function processPackingScan(item: OfflineQueueItem): Promise<void> {
  const sessionId = String(item.payload.session_id ?? "");
  const barcode = String(item.payload.barcode ?? "");
  if (!sessionId || !barcode) throw new Error("Payload packing_scan tidak lengkap");
  await scanPackingMobile(sessionId, barcode);
}

async function processOpnameLine(item: OfflineQueueItem): Promise<void> {
  const sessionId = String(item.payload.session_id ?? "");
  const lineId = String(item.payload.line_id ?? "");
  const counted = Number(item.payload.counted_qty ?? NaN);
  if (!sessionId || !lineId || !Number.isFinite(counted)) {
    throw new Error("Payload opname_line tidak lengkap");
  }
  await submitOpnameLineMobile(sessionId, lineId, counted);
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
    case "packing_scan":
      await processPackingScan(item);
      break;
    case "opname_line":
      await processOpnameLine(item);
      break;
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
