import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import {
  isDamagedWarehouse,
  isSalesWarehouse,
  resolveWarehouseKind,
  WAREHOUSE_KIND_LABELS,
  type WarehouseKind,
} from "@/lib/bisnis/warehouse-categories";

export type ProductWarehouseStockRow = {
  warehouseId: string;
  code: string;
  name: string;
  kind: WarehouseKind;
  kindLabel: string;
  onHand: number;
  available: number;
  reserved: number;
};

export type ProductStockOverview = {
  rows: ProductWarehouseStockRow[];
  /** Entitas + sementara + penjualan — tanpa gudang rusak */
  totalOnHand: number;
  totalAvailable: number;
  totalReserved: number;
  /** Hanya gudang penjualan retail */
  sellableOnHand: number;
  sellableAvailable: number;
  /** Karantina — tidak masuk global entitas */
  damagedOnHand: number;
};

type WarehouseRecord = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
  warehouse_role?: string;
  store?: string;
};

export async function fetchProductStockOverview(productId: string): Promise<ProductStockOverview> {
  const [warehouses, balanceRes] = await Promise.all([
    pb.collection(INV_COLLECTIONS.warehouses).getFullList<WarehouseRecord>({
      sort: "code",
      requestKey: null,
    }),
    pb.collection(INV_COLLECTIONS.balances).getFullList({
      filter: `product = "${productId}"`,
      expand: "warehouse",
      requestKey: null,
    }),
  ]);

  const activeWarehouses = warehouses.filter((w) => w.is_active !== false);

  const totalsByWarehouse: Record<
    string,
    { onHand: number; available: number; reserved: number }
  > = {};

  for (const row of balanceRes) {
    const whId = String(row.warehouse ?? "");
    if (!whId) continue;
    if (!totalsByWarehouse[whId]) {
      totalsByWarehouse[whId] = { onHand: 0, available: 0, reserved: 0 };
    }
    totalsByWarehouse[whId].onHand += Number(row.qty_on_hand) || 0;
    totalsByWarehouse[whId].available += Number(row.qty_available) || 0;
    totalsByWarehouse[whId].reserved += Number(row.qty_reserved) || 0;
  }

  const rows: ProductWarehouseStockRow[] = activeWarehouses.map((wh) => {
    const kind = resolveWarehouseKind(wh);
    const totals = totalsByWarehouse[wh.id] ?? { onHand: 0, available: 0, reserved: 0 };
    return {
      warehouseId: wh.id,
      code: wh.code,
      name: wh.name,
      kind,
      kindLabel: WAREHOUSE_KIND_LABELS[kind],
      onHand: totals.onHand,
      available: totals.available,
      reserved: totals.reserved,
    };
  });

  const operationalRows = rows.filter((r) => r.kind !== "damaged");
  const salesRows = rows.filter((r) => r.kind === "sales");
  const damagedRows = rows.filter((r) => r.kind === "damaged");

  const totalOnHand = operationalRows.reduce((s, r) => s + r.onHand, 0);
  const totalAvailable = operationalRows.reduce((s, r) => s + r.available, 0);
  const totalReserved = operationalRows.reduce((s, r) => s + r.reserved, 0);
  const sellableOnHand = salesRows.reduce((s, r) => s + r.onHand, 0);
  const sellableAvailable = salesRows.reduce((s, r) => s + r.available, 0);
  const damagedOnHand = damagedRows.reduce((s, r) => s + r.onHand, 0);

  return {
    rows,
    totalOnHand,
    totalAvailable,
    totalReserved,
    sellableOnHand,
    sellableAvailable,
    damagedOnHand,
  };
}

/** Stok operasional perusahaan (entitas + sementara + penjualan) — gudang rusak dikecualikan. */
export async function fetchProductsGlobalStock(
  productIds: string[],
): Promise<Record<string, number>> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const [warehouses, balances] = await Promise.all([
    pb.collection(INV_COLLECTIONS.warehouses).getFullList<WarehouseRecord>({
      fields: "id,is_active,warehouse_role,store",
      requestKey: null,
    }),
    pb.collection(INV_COLLECTIONS.balances).getFullList({
      filter: uniqueIds.map((id) => `product = "${id}"`).join(" || "),
      fields: "product,warehouse,qty_on_hand",
      requestKey: null,
    }),
  ]);

  const operationalWarehouseIds = new Set(
    warehouses
      .filter((w) => w.is_active !== false && !isDamagedWarehouse(w))
      .map((w) => w.id),
  );

  const totals: Record<string, number> = {};
  for (const id of uniqueIds) totals[id] = 0;

  for (const row of balances) {
    const productId = String(row.product ?? "");
    const warehouseId = String(row.warehouse ?? "");
    if (!productId || !warehouseId || !operationalWarehouseIds.has(warehouseId)) continue;
    totals[productId] = (totals[productId] ?? 0) + (Number(row.qty_on_hand) || 0);
  }

  return totals;
}

export type ProductStockTotals = {
  global: Record<string, number>;
  sellable: Record<string, number>;
};

/** Global (tanpa rusak) + siap jual (retail) — untuk daftar produk. */
export async function fetchProductsStockTotals(
  productIds: string[],
): Promise<ProductStockTotals> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (uniqueIds.length === 0) return { global: {}, sellable: {} };

  const [warehouses, balances] = await Promise.all([
    pb.collection(INV_COLLECTIONS.warehouses).getFullList<WarehouseRecord>({
      fields: "id,is_active,warehouse_role,store",
      requestKey: null,
    }),
    pb.collection(INV_COLLECTIONS.balances).getFullList({
      filter: uniqueIds.map((id) => `product = "${id}"`).join(" || "),
      fields: "product,warehouse,qty_on_hand",
      requestKey: null,
    }),
  ]);

  const globalWh = new Set(
    warehouses.filter((w) => w.is_active !== false && !isDamagedWarehouse(w)).map((w) => w.id),
  );
  const salesWh = new Set(
    warehouses.filter((w) => w.is_active !== false && isSalesWarehouse(w)).map((w) => w.id),
  );

  const global: Record<string, number> = {};
  const sellable: Record<string, number> = {};
  for (const id of uniqueIds) {
    global[id] = 0;
    sellable[id] = 0;
  }

  for (const row of balances) {
    const productId = String(row.product ?? "");
    const warehouseId = String(row.warehouse ?? "");
    const qty = Number(row.qty_on_hand) || 0;
    if (!productId || !warehouseId || qty <= 0) continue;
    if (globalWh.has(warehouseId)) global[productId] = (global[productId] ?? 0) + qty;
    if (salesWh.has(warehouseId)) sellable[productId] = (sellable[productId] ?? 0) + qty;
  }

  return { global, sellable };
}

/** Stok fisik per toko penjualan (jumlah gudang yang terhubung ke toko). */
export async function fetchProductStockByStore(productId: string): Promise<Record<string, number>> {
  const overview = await fetchProductStockOverview(productId);
  const warehouses = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<WarehouseRecord>({
    fields: "id,store,is_active",
    requestKey: null,
  });

  const storeByWarehouse = new Map<string, string>();
  for (const wh of warehouses) {
    if (wh.is_active === false || !wh.store) continue;
    storeByWarehouse.set(wh.id, wh.store);
  }

  const byStore: Record<string, number> = {};
  for (const row of overview.rows) {
    const storeId = storeByWarehouse.get(row.warehouseId);
    if (!storeId) continue;
    byStore[storeId] = (byStore[storeId] ?? 0) + row.onHand;
  }
  return byStore;
}
