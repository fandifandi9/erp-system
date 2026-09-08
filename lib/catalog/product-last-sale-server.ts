import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { getCatalogPb } from "@/lib/catalog/api-server";
import {
  PRODUCT_STALE_SALE_DAYS,
  type ProductLastSaleInfo,
} from "@/lib/catalog/product-last-sale";

const EMPTY_LAST_SALE: ProductLastSaleInfo = {
  lastSaleDate: null,
  daysSinceSale: null,
  isStale: false,
};

function escId(id: string): string {
  return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function daysBetween(fromYmd: string, to = new Date()): number {
  const start = new Date(`${fromYmd.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.floor((to.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function parseLastSaleFromLine(row: unknown): string | null {
  const line = row as {
    expand?: { sales_order?: { status?: string; order_date?: string } };
  };
  const so = line.expand?.sales_order;
  if (!so || so.status === "cancelled") return null;
  return so.order_date?.slice(0, 10) ?? null;
}

const BATCH_SIZE = 12;

export async function getProductsLastSaleServer(
  productIds: string[],
): Promise<Record<string, ProductLastSaleInfo>> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  const result: Record<string, ProductLastSaleInfo> = {};
  for (const id of uniqueIds) result[id] = EMPTY_LAST_SALE;
  if (uniqueIds.length === 0) return result;

  const pb = await getCatalogPb();

  async function fetchOne(productId: string): Promise<ProductLastSaleInfo> {
    try {
      const res = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getList(1, 1, {
        filter: `product = "${escId(productId)}"`,
        sort: "-created",
        fields: "product,created",
        expand: "sales_order.status,sales_order.order_date",
        requestKey: null,
      });
      const lastSaleDate = res.items[0] ? parseLastSaleFromLine(res.items[0]) : null;
      const daysSinceSale = lastSaleDate ? daysBetween(lastSaleDate) : null;
      return {
        lastSaleDate,
        daysSinceSale,
        isStale: lastSaleDate ? daysSinceSale! >= PRODUCT_STALE_SALE_DAYS : false,
      };
    } catch {
      return EMPTY_LAST_SALE;
    }
  }

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const chunk = uniqueIds.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(chunk.map((id) => fetchOne(id)));
    chunk.forEach((id, idx) => {
      result[id] = chunkResults[idx] ?? EMPTY_LAST_SALE;
    });
  }

  return result;
}
