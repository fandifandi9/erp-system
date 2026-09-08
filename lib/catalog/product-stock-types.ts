import type { WarehouseKind } from "@/lib/bisnis/warehouse-categories";

export type ProductWarehouseStockRow = {
  warehouseId: string;
  code: string;
  name: string;
  kind: WarehouseKind;
  kindLabel: string;
  companyId?: string;
  companyName?: string;
  storeId?: string;
  storeName?: string;
  isPrimaryEntity: boolean;
  onHand: number;
  available: number;
  reserved: number;
};

export type ProductStockKindSummary = {
  kind: WarehouseKind;
  label: string;
  items: { code: string; name: string; companyName?: string; qty: number }[];
};

export type ProductStockOverview = {
  rows: ProductWarehouseStockRow[];
  stockedByKind: ProductStockKindSummary[];
  entityWarehouses: { companyName: string; code: string; name: string; qty: number }[];
  totalOnHand: number;
  totalAvailable: number;
  totalReserved: number;
  sellableOnHand: number;
  sellableAvailable: number;
  damagedOnHand: number;
};

export type ProductStockTotals = {
  global: Record<string, number>;
  sellable: Record<string, number>;
};
