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
}): WarehouseKind {
  if (row.warehouse_role === ENTITY_WAREHOUSE_ROLE) return "entity";
  if (row.warehouse_role === TRANSIT_WAREHOUSE_ROLE) return "transit";
  if (row.warehouse_role === DAMAGED_WAREHOUSE_ROLE) return "damaged";
  if (row.warehouse_role === SALES_WAREHOUSE_ROLE || row.store) return "sales";
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
    "Satu per entitas — penerimaan pembelian saja. Stok keluar ke toko via Transfer Gudang, bukan penjualan langsung.",
  sales:
    "Terikat toko — stok untuk penjualan (online, POS, offline per kota). Satu toko boleh punya banyak gudang.",
  transit:
    "Satu per entitas — penampung sementara: barang penerimaan WMS yang belum selesai QC, retur/refund yang belum disortir. Stok dipindah ke gudang entitas, penjualan, atau rusak via Transfer Gudang.",
  damaged:
    "Satu per entitas — karantina barang rusak/cacat sebelum kanibal atau pembuangan. Tidak untuk penjualan atau pembelian langsung.",
};

export const WAREHOUSE_KIND_DEFAULT_NAMES: Record<WarehouseKind, string> = {
  entity: "Gudang Utama",
  sales: "",
  transit: "Gudang Sementara",
  damaged: "Gudang Rusak",
};
