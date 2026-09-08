import type { WarehouseRole } from "./entity-modules";

/** Gudang entitas — satu per PT/CV, hanya penerimaan pembelian. */
export const ENTITY_WAREHOUSE_ROLE: WarehouseRole = "main";

/** Gudang penjualan — terikat toko, untuk SO / POS / online. */
export const SALES_WAREHOUSE_ROLE: WarehouseRole = "retail";

/** Gudang sementara — QC penerimaan, retur belum disortir (tidak untuk jual/beli langsung). */
export const TRANSIT_WAREHOUSE_ROLE: WarehouseRole = "transit";

/** Gudang rusak — karantina barang cacat sebelum kanibal / buang. */
export const DAMAGED_WAREHOUSE_ROLE: WarehouseRole = "damaged";

export type WarehouseKind = "entity" | "sales" | "transit" | "damaged";

export function resolveWarehouseKind(row: {
  warehouse_role?: string;
  store?: string;
  company?: string;
}): WarehouseKind {
  if (row.warehouse_role === ENTITY_WAREHOUSE_ROLE) return "entity";
  if (row.warehouse_role === TRANSIT_WAREHOUSE_ROLE) return "transit";
  if (row.warehouse_role === DAMAGED_WAREHOUSE_ROLE) return "damaged";
  if (row.warehouse_role === SALES_WAREHOUSE_ROLE || row.store) return "sales";
  // Legacy: gudang terikat entitas (company) tanpa role eksplisit
  if ("company" in row && row.company && !row.store) return "entity";
  return "sales";
}

export function warehouseKindToRole(kind: WarehouseKind): WarehouseRole {
  switch (kind) {
    case "entity":
      return ENTITY_WAREHOUSE_ROLE;
    case "sales":
      return SALES_WAREHOUSE_ROLE;
    case "transit":
      return TRANSIT_WAREHOUSE_ROLE;
    case "damaged":
      return DAMAGED_WAREHOUSE_ROLE;
  }
}

export function isEntityReceivingWarehouse(row: { warehouse_role?: string }): boolean {
  return row.warehouse_role === ENTITY_WAREHOUSE_ROLE;
}

export function isSalesWarehouse(row: { warehouse_role?: string; store?: string }): boolean {
  return resolveWarehouseKind(row) === "sales";
}

export function isBufferWarehouse(row: { warehouse_role?: string }): boolean {
  const r = row.warehouse_role;
  return r === TRANSIT_WAREHOUSE_ROLE || r === DAMAGED_WAREHOUSE_ROLE;
}

export function isTransitWarehouse(row: { warehouse_role?: string }): boolean {
  return row.warehouse_role === TRANSIT_WAREHOUSE_ROLE;
}

export function isDamagedWarehouse(row: { warehouse_role?: string }): boolean {
  return row.warehouse_role === DAMAGED_WAREHOUSE_ROLE;
}

export const WAREHOUSE_KIND_LABELS: Record<WarehouseKind, string> = {
  entity: "Gudang Entitas",
  sales: "Gudang Penjualan",
  transit: "Gudang Sementara",
  damaged: "Gudang Rusak",
};

export const WAREHOUSE_KIND_DESCRIPTIONS: Record<WarehouseKind, string> = {
  entity:
    "Satu per entitas — dibuat otomatis saat entitas baru. Penerimaan pembelian saja; stok ke toko via Transfer Gudang.",
  sales:
    "Terikat toko — stok untuk penjualan (online, POS, offline). Satu toko boleh punya banyak gudang; bisa ditambah manual di halaman ini.",
  transit:
    "Satu per entitas — dibuat otomatis saat entitas baru. Penampung QC penerimaan dan retur belum disortir.",
  damaged:
    "Satu per entitas — dibuat otomatis saat entitas baru. Karantina barang rusak/cacat.",
};

export const WAREHOUSE_KIND_DEFAULT_NAMES: Record<WarehouseKind, string> = {
  entity: "Gudang Utama",
  sales: "",
  transit: "Gudang Sementara",
  damaged: "Gudang Rusak",
};
