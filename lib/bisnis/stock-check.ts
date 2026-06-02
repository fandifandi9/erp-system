import { fetchWarehouseStockMap, getWarehouseStockQty } from "./warehouse-stock";

export type StockLine = { product: string; productName?: string; qty: number };

/** Cek stok gudang sebelum penjualan. Return pesan error atau null jika cukup. */
export async function validateStockForSale(
  warehouseId: string,
  lines: StockLine[],
): Promise<string | null> {
  if (!warehouseId) {
    return "Gudang toko belum dipilih — stok tidak bisa dicek.";
  }

  const stockMap = await fetchWarehouseStockMap(warehouseId);
  const issues: string[] = [];

  for (const line of lines) {
    if (!line.product || line.qty <= 0) continue;

    const onHand = getWarehouseStockQty(stockMap, line.product);

    if (onHand < line.qty) {
      const name = line.productName || line.product;
      issues.push(`• ${name}: butuh ${line.qty}, stok tersedia ${onHand}`);
    }
  }

  if (issues.length === 0) return null;
  return `Stok tidak mencukupi di gudang ini. Penjualan tidak dapat dilanjutkan.\n${issues.join("\n")}`;
}
