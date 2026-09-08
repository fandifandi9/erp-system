/**
 * WMS memakai stok pusat yang sama dengan ERP / Bisnis (inv_stock_balances).
 */
export {
  fetchStockMapByWarehouse,
  fetchStockMapForProducts,
  fetchGlobalStockByProduct,
  getStockQtyFromMap,
} from "@/lib/inventory/stock-balances";

import {
  fetchStockMapForProducts,
  getStockQtyFromMap,
} from "@/lib/inventory/stock-balances";

export async function getWarehouseStockQty(
  warehouseId: string,
  productId: string,
): Promise<number> {
  const map = await fetchStockMapForProducts(warehouseId, [productId]);
  return getStockQtyFromMap(map, productId);
}

export function assertNonNegativeStock(
  _productLabel: string,
  _available: number,
  _requested: number,
): void {
  // Stok boleh minus (backorder) — tidak diblok di picking maupun penjualan.
}
