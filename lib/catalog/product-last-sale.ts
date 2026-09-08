/** Hari tanpa penjualan sebelum dianggap "lama tidak terjual". */
export const PRODUCT_STALE_SALE_DAYS = 90;

export type ProductLastSaleInfo = {
  lastSaleDate: string | null;
  daysSinceSale: number | null;
  isStale: boolean;
};

export function isProductLowStock(globalStock: number, minStock?: number | null): boolean {
  const min = Number(minStock) || 0;
  return min > 0 && globalStock <= min;
}

/** @deprecated Pakai fetchCatalogStockMeta — tetap ada untuk kompatibilitas. */
export async function fetchProductsLastSale(
  productIds: string[],
): Promise<Record<string, ProductLastSaleInfo>> {
  const { fetchCatalogStockMeta } = await import("@/lib/catalog/product-stock");
  const meta = await fetchCatalogStockMeta(productIds);
  return meta.lastSales;
}
