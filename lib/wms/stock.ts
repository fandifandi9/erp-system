/**
 * WMS memakai stok pusat yang sama dengan ERP / Bisnis (inv_stock_balances).
 */
export {
  fetchStockMapByWarehouse,
  fetchGlobalStockByProduct,
  getStockQtyFromMap,
} from "@/lib/inventory/stock-balances";

import {
  fetchStockMapByWarehouse,
  getStockQtyFromMap,
} from "@/lib/inventory/stock-balances";

export async function getWarehouseStockQty(
  warehouseId: string,
  productId: string,
): Promise<number> {
  const map = await fetchStockMapByWarehouse(warehouseId);
  return getStockQtyFromMap(map, productId);
}

export function assertNonNegativeStock(
  productLabel: string,
  available: number,
  requested: number,
): void {
  if (requested <= 0) return;
  if (available < requested) {
    throw new Error(
      `Stok tidak cukup untuk ${productLabel}: butuh ${requested}, tersedia ${available}.`,
    );
  }
}
