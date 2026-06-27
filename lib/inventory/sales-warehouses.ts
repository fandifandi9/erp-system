import type PocketBase from "pocketbase";
import { isSalesWarehouse } from "@/lib/bisnis/warehouse-categories";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

export type SalesWarehouseRow = {
  id: string;
  code: string;
  name: string;
  store?: string;
  warehouse_role?: string;
  expand?: { store?: { id: string; name: string; code?: string } };
};

/** Gudang penjualan retail — terikat toko, bukan entitas/transit/rusak. */
export async function fetchActiveSalesWarehouses(
  pb: PocketBase,
): Promise<SalesWarehouseRow[]> {
  const rows = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<SalesWarehouseRow>({
    filter: 'is_active = true',
    sort: "code",
    fields: "id,code,name,store,warehouse_role",
    expand: "store",
    requestKey: null,
  });
  return rows.filter(isSalesWarehouse);
}

export async function fetchActiveSalesWarehouseIds(pb: PocketBase): Promise<string[]> {
  const rows = await fetchActiveSalesWarehouses(pb);
  return rows.map((w) => w.id);
}

/** Total on-hand komponen di semua gudang penjualan retail. */
export async function fetchProductsStockInSalesWarehouses(
  pb: PocketBase,
  productIds: string[],
): Promise<Record<string, number>> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const salesWarehouseIds = new Set(await fetchActiveSalesWarehouseIds(pb));
  if (salesWarehouseIds.size === 0) {
    return Object.fromEntries(uniqueIds.map((id) => [id, 0]));
  }

  const balances = await pb.collection(INV_COLLECTIONS.balances).getFullList({
    filter: uniqueIds.map((id) => `product = "${id.replace(/"/g, '\\"')}"`).join(" || "),
    fields: "product,warehouse,qty_on_hand",
    requestKey: null,
  });

  const totals: Record<string, number> = {};
  for (const id of uniqueIds) totals[id] = 0;

  for (const row of balances) {
    const productId = String(row.product ?? "");
    const warehouseId = String(row.warehouse ?? "");
    if (!productId || !warehouseId || !salesWarehouseIds.has(warehouseId)) continue;
    totals[productId] = (totals[productId] ?? 0) + (Number(row.qty_on_hand) || 0);
  }

  return totals;
}
