import type { Store } from "@/lib/bisnis/types";

export type ProductStorePriceRow = {
  storeId: string;
  storeName: string;
  storeCode?: string;
  priceRowId?: string;
  /** 0 jika belum ada override toko */
  sellPrice: number;
  hasOverride: boolean;
};

type PriceRecord = {
  id: string;
  store?: string;
  sell_price?: number;
  expand?: { store?: { id: string; name: string; code?: string } };
};

export function mergeProductStorePrices(
  stores: Store[],
  priceRows: PriceRecord[],
): ProductStorePriceRow[] {
  const byStore = new Map<string, PriceRecord>();
  for (const row of priceRows) {
    const storeId = row.store || row.expand?.store?.id;
    if (!storeId) continue;
    if (!byStore.has(storeId)) byStore.set(storeId, row);
  }

  return stores
    .filter((s) => s.is_active !== false)
    .map((store) => {
      const hit = byStore.get(store.id);
      const sellPrice = hit ? Number(hit.sell_price) || 0 : 0;
      return {
        storeId: store.id,
        storeName: store.name,
        storeCode: store.code,
        priceRowId: hit?.id,
        sellPrice,
        hasOverride: !!hit,
      };
    })
    .sort((a, b) => a.storeName.localeCompare(b.storeName, "id"));
}
