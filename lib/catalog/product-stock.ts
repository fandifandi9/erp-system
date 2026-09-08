export type {
  ProductStockKindSummary,
  ProductStockOverview,
  ProductStockTotals,
  ProductWarehouseStockRow,
} from "@/lib/catalog/product-stock-types";

import type { ProductStockOverview, ProductStockTotals } from "@/lib/catalog/product-stock-types";
import type { ProductLastSaleInfo } from "@/lib/catalog/product-last-sale";
import { invalidateStockCache } from "@/lib/catalog/stock-cache";

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((data as { error?: string }).error || "Gagal memuat stok."));
  }
  return data;
}

export type CatalogStockMeta = ProductStockTotals & {
  lastSales: Record<string, ProductLastSaleInfo>;
};

/** Satu panggilan API untuk stok + penjualan terakhir (daftar produk). */
export async function fetchCatalogStockMeta(productIds: string[]): Promise<CatalogStockMeta> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { global: {}, sellable: {}, lastSales: {} };
  }

  const res = await fetch("/api/catalog/products/stock-meta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productIds: uniqueIds }),
    cache: "no-store",
  });
  const data = await readJson(res);
  return {
    global: (data.global as Record<string, number>) ?? {},
    sellable: (data.sellable as Record<string, number>) ?? {},
    lastSales: (data.lastSales as Record<string, ProductLastSaleInfo>) ?? {},
  };
}

export async function fetchProductStockOverview(
  productId: string,
  opts?: { fresh?: boolean },
): Promise<ProductStockOverview> {
  const qs = opts?.fresh ? "?fresh=1" : "";
  const res = await fetch(`/api/catalog/products/${productId}/stock-overview${qs}`, {
    cache: "no-store",
  });
  const data = await readJson(res);
  return data.overview as ProductStockOverview;
}

export async function fetchProductsStockTotals(productIds: string[]): Promise<ProductStockTotals> {
  const meta = await fetchCatalogStockMeta(productIds);
  return { global: meta.global, sellable: meta.sellable };
}

export async function fetchProductsGlobalStock(productIds: string[]): Promise<Record<string, number>> {
  const totals = await fetchProductsStockTotals(productIds);
  return totals.global;
}

export function stockByStoreFromOverview(overview: ProductStockOverview): Record<string, number> {
  const byStore: Record<string, number> = {};
  for (const row of overview.rows) {
    if (!row.storeId) continue;
    byStore[row.storeId] = (byStore[row.storeId] ?? 0) + row.onHand;
  }
  return byStore;
}

export async function fetchProductStockByStore(productId: string): Promise<Record<string, number>> {
  const overview = await fetchProductStockOverview(productId);
  return stockByStoreFromOverview(overview);
}

export function invalidateProductStockCache(productId?: string): void {
  if (productId) invalidateStockCache(`overview:${productId}`);
  else invalidateStockCache();
}
