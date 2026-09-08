/** Nama modul di UI mobile. */
export const INVENTORY_MODULE_NAME = "Inventori";

export const MOVEMENT_TYPE_LABELS = {
  IN: "Masuk",
  OUT: "Keluar",
} as const;

export const PACKING_STATUS_LABELS: Record<string, string> = {
  open: "Buka",
  in_progress: "Berjalan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export const OPNAME_STATUS_LABELS: Record<string, string> = {
  draft: "Draf",
  counting: "Menghitung",
  review: "Ditinjau",
  approved: "Disetujui",
  posted: "Diposting",
  cancelled: "Dibatalkan",
};

export function labelMovementType(type: string): string {
  return MOVEMENT_TYPE_LABELS[type as keyof typeof MOVEMENT_TYPE_LABELS] || type;
}

export function labelOpnameStatus(status: string): string {
  return OPNAME_STATUS_LABELS[status] || status;
}
