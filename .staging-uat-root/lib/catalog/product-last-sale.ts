import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

/** Hari tanpa penjualan sebelum dianggap "lama tidak terjual". */
export const PRODUCT_STALE_SALE_DAYS = 90;

export type ProductLastSaleInfo = {
  lastSaleDate: string | null;
  daysSinceSale: number | null;
  isStale: boolean;
};

function daysBetween(fromYmd: string, to = new Date()): number {
  const start = new Date(`${fromYmd.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.floor((to.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export async function fetchProductsLastSale(
  productIds: string[],
): Promise<Record<string, ProductLastSaleInfo>> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  const result: Record<string, ProductLastSaleInfo> = {};
  for (const id of uniqueIds) {
    result[id] = { lastSaleDate: null, daysSinceSale: null, isStale: false };
  }
  if (uniqueIds.length === 0) return result;

  const lines = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList({
    filter: uniqueIds.map((id) => `product = "${id}"`).join(" || "),
    sort: "-created",
    expand: "sales_order",
    requestKey: null,
  });

  const latestDateByProduct = new Map<string, string>();

  for (const row of lines) {
    const line = row as unknown as {
      product: string;
      expand?: { sales_order?: { status?: string; order_date?: string } };
    };
    const productId = line.product;
    if (!productId || latestDateByProduct.has(productId)) continue;
    const so = line.expand?.sales_order;
    if (!so || so.status === "cancelled") continue;
    const orderDate = so.order_date?.slice(0, 10);
    if (!orderDate) continue;
    latestDateByProduct.set(productId, orderDate);
  }

  for (const id of uniqueIds) {
    const lastSaleDate = latestDateByProduct.get(id) ?? null;
    const daysSinceSale = lastSaleDate ? daysBetween(lastSaleDate) : null;
    result[id] = {
      lastSaleDate,
      daysSinceSale,
      isStale: lastSaleDate
        ? daysSinceSale! >= PRODUCT_STALE_SALE_DAYS
        : false,
    };
  }

  return result;
}

export function isProductLowStock(globalStock: number, minStock?: number | null): boolean {
  const min = Number(minStock) || 0;
  return min > 0 && globalStock <= min;
}
