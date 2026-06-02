import { resolveProductByScan } from "@/lib/wms/product-master";
import { assertNonNegativeStock, getWarehouseStockQty } from "@/lib/wms/stock";

export async function validateBarcodeScan(code: string) {
  const product = await resolveProductByScan(code);
  if (!product) {
    throw new Error(`Barcode/SKU tidak valid atau produk tidak aktif: ${code}`);
  }
  return product;
}

export async function validatePickingQty(
  warehouseId: string,
  productId: string,
  productLabel: string,
  qty: number,
): Promise<void> {
  if (!warehouseId) throw new Error("Gudang belum dipilih.");
  const available = await getWarehouseStockQty(warehouseId, productId);
  assertNonNegativeStock(productLabel, available, qty);
}
