/**
 * Antrean ringan outbox untuk operasional mobile (bukan full offline ERP).
 */

export const OFFLINE_QUEUE_STORAGE_KEY = "mobile:pending_sync:v1";

export const OFFLINE_QUEUE_MAX_RETRIES = 12;

/** Backoff dasar (ms); total ≈ < 2 menit bila semua retry habis. */
export const OFFLINE_QUEUE_BASE_BACKOFF_MS = 800;

export type OfflineQueueItemType =
  | "attendance_checkin"
  | "attendance_checkout"
  | "inventory_zone_checkin"
  | "inventory_zone_checkout"
  /** Stub / ekstensi — sinkron ke PB bila koleksi tersedia */
  | "opname_line"
  | "packing_scan"
  | "activity_metadata";

export type OfflineQueueStatus = "pending" | "failed";

export type OfflineQueueItem = {
  id: string;
  type: OfflineQueueItemType;
  payload: Record<string, unknown>;
  created_at: string;
  retry_count: number;
  status: OfflineQueueStatus;
  /** Kunci idempotensi per perangkat (hindari double enqueue). */
  idempotency_key: string;
  request_id: string;
  device_id?: string;
  /** ISO — jangan kirim sebelum waktu ini (backoff). */
  next_attempt_at?: string;
  last_error?: string;
};

export type OfflineQueueSnapshot = {
  items: OfflineQueueItem[];
  updated_at: string;
};
