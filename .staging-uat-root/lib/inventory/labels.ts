import type { MovementStatus, MovementType, OpnameCountMethod, ZoneType } from "@/lib/inventory/types";

/** Nama modul di UI — bukan "Inventory SERBA". */
export const INVENTORY_MODULE_NAME = "Inventori";

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  IN: "Masuk",
  OUT: "Keluar",
  TRANSFER: "Transfer",
  RETURN: "Retur",
  DAMAGE: "Rusak",
  ADJUSTMENT: "Penyesuaian",
};

export const MOVEMENT_STATUS_LABELS: Record<MovementStatus, string> = {
  draft: "Draf",
  posted: "Diposting",
  void: "Dibatalkan",
  cancelled: "Dibatalkan",
};

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  receiving: "Penerimaan",
  packing: "Kemasan",
  qc: "QC",
  return: "Retur",
  rack: "Rak",
  shipping: "Pengiriman",
  counting: "Opname",
};

export const OPNAME_METHOD_LABELS: Record<OpnameCountMethod, string> = {
  full: "Seluruh gudang",
  cycle: "Hitung siklus",
  spot: "Pengecekan spot",
};

export const OPNAME_STATUS_LABELS: Record<string, string> = {
  draft: "Draf",
  counting: "Menghitung",
  review: "Review",
  approved: "Disetujui",
  posted: "Diposting",
  cancelled: "Dibatalkan",
};

export const PACKING_STATUS_LABELS: Record<string, string> = {
  open: "Buka",
  in_progress: "Berjalan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  zone_checkin: "Masuk zona",
  zone_checkout: "Keluar zona",
  scan_zone_qr: "Scan QR zona",
  scan_product: "Scan produk",
  scan_location: "Scan lokasi",
  movement_create_draft: "Buat draf mutasi",
  movement_post_request: "Permintaan posting mutasi",
  packing_scan: "Scan kemasan",
  packing_complete: "Selesai kemasan",
  opname_count: "Hitung opname",
};

export function labelMovementType(type: string): string {
  return MOVEMENT_TYPE_LABELS[type as MovementType] || type;
}

export function labelMovementStatus(status: string): string {
  return MOVEMENT_STATUS_LABELS[status as MovementStatus] || status;
}

export function labelZoneType(type: string): string {
  return ZONE_TYPE_LABELS[type as ZoneType] || type;
}

export function labelActivityType(type: string): string {
  return ACTIVITY_TYPE_LABELS[type] || type;
}

export function labelOpnameStatus(status: string): string {
  return OPNAME_STATUS_LABELS[status] || status;
}

export function labelOpnameMethod(method: string): string {
  return OPNAME_METHOD_LABELS[method as OpnameCountMethod] || method;
}

export function labelPackingStatus(status: string): string {
  return PACKING_STATUS_LABELS[status] || status;
}
