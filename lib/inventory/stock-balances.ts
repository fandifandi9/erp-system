import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

/** Satu sumber kebenaran stok: koleksi inv_stock_balances (ledger pembelian/penjualan/WMS). */

export async function fetchStockMapByWarehouse(
  warehouseId: string,
): Promise<Record<string, number>> {
  if (!warehouseId) return {};

  const balances = await pb.collection(INV_COLLECTIONS.balances).getFullList({
    filter: `warehouse = "${warehouseId}"`,
    fields: "product,qty_on_hand,qty_available",
    requestKey: null,
  });

  const map: Record<string, number> = {};
  for (const row of balances) {
    const productId = String((row as { product?: string }).product || "");
    if (!productId) continue;
    const qty = Number((row as { qty_on_hand?: number }).qty_on_hand) || 0;
    map[productId] = (map[productId] ?? 0) + qty;
  }
  return map;
}

/** Total stok produk di semua gudang (untuk daftar produk / ringkasan). */
export async function fetchGlobalStockByProduct(): Promise<Record<string, number>> {
  const balances = await pb.collection(INV_COLLECTIONS.balances).getFullList({
    fields: "product,qty_on_hand",
    requestKey: null,
  });

  const map: Record<string, number> = {};
  for (const row of balances) {
    const productId = String((row as { product?: string }).product || "");
    if (!productId) continue;
    const qty = Number((row as { qty_on_hand?: number }).qty_on_hand) || 0;
    map[productId] = (map[productId] ?? 0) + qty;
  }
  return map;
}

export function getStockQtyFromMap(
  stockMap: Record<string, number>,
  productId: string,
): number {
  if (!productId) return 0;
  return stockMap[productId] ?? 0;
}
