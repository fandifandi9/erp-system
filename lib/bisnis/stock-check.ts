import { pb } from "@/lib/pocketbase";
import { validateStockForSaleExpanded } from "@/lib/catalog/sale-stock-lines";
import type { SaleLineForStock } from "@/lib/catalog/sale-stock-lines";

export type StockLine = { product: string; productName?: string; qty: number };

/** Cek stok gudang sebelum penjualan (expand bundle → komponen). */
export async function validateStockForSale(
  warehouseId: string,
  lines: StockLine[],
  opts?: { warehouseName?: string },
): Promise<string | null> {
  return validateStockForSaleExpanded(pb, warehouseId, lines as SaleLineForStock[], opts);
}
