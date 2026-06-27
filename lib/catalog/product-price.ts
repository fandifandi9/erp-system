import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type ProductPrice } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

export type SellPriceSource = "store" | "global";

export type ResolvedSellPrice = {
  sellPrice: number;
  source: SellPriceSource;
  priceRowId?: string;
};

const DEFAULT_PRICE_LEVEL = "retail";

function escId(id: string): string {
  return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Harga jual efektif: toko → global inv_products.sell_price. */
export async function resolveSellPrice(
  pb: PocketBase,
  productId: string,
  storeId?: string,
): Promise<ResolvedSellPrice> {
  if (storeId) {
    try {
      const rows = await pb.collection(BISNIS_COLLECTIONS.productPrices).getFullList<ProductPrice>({
        filter: `product = "${escId(productId)}" && store = "${escId(storeId)}" && is_active = true`,
        sort: "-created",
        fields: "id,sell_price",
        requestKey: null,
      });
      const hit = rows.find((r) => Number(r.sell_price) > 0) ?? rows[0];
      if (hit) {
        return {
          sellPrice: Number(hit.sell_price) || 0,
          source: "store",
          priceRowId: hit.id,
        };
      }
    } catch {
      /* field store belum dimigrasi — fallback global */
    }
  }

  const product = await pb.collection(INV_COLLECTIONS.products).getOne<{ sell_price?: number }>(
    productId,
    { fields: "sell_price", requestKey: null },
  );
  return {
    sellPrice: Number(product.sell_price) || 0,
    source: "global",
  };
}

export async function resolveSellPricesForProducts(
  pb: PocketBase,
  productIds: string[],
  storeId?: string,
): Promise<Map<string, ResolvedSellPrice>> {
  const out = new Map<string, ResolvedSellPrice>();
  if (productIds.length === 0) return out;

  const unique = [...new Set(productIds)];
  let storeRows: ProductPrice[] = [];
  if (storeId) {
    try {
      const prodFilter = unique.map((id) => `product = "${escId(id)}"`).join(" || ");
      storeRows = await pb.collection(BISNIS_COLLECTIONS.productPrices).getFullList<ProductPrice>({
        filter: `(${prodFilter}) && store = "${escId(storeId)}" && is_active = true`,
        fields: "id,product,sell_price",
        requestKey: null,
      });
    } catch {
      storeRows = [];
    }
  }

  const storeByProduct = new Map<string, ProductPrice>();
  for (const row of storeRows) {
    if (!storeByProduct.has(row.product)) storeByProduct.set(row.product, row);
  }

  const missing: string[] = [];
  for (const id of unique) {
    const storeRow = storeByProduct.get(id);
    if (storeRow) {
      out.set(id, {
        sellPrice: Number(storeRow.sell_price) || 0,
        source: "store",
        priceRowId: storeRow.id,
      });
    } else {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    const filter = missing.map((id) => `id = "${escId(id)}"`).join(" || ");
    const products = await pb.collection(INV_COLLECTIONS.products).getFullList<{
      id: string;
      sell_price?: number;
    }>({
      filter,
      fields: "id,sell_price",
      requestKey: null,
    });
    for (const p of products) {
      out.set(p.id, { sellPrice: Number(p.sell_price) || 0, source: "global" });
    }
  }

  return out;
}

export async function listStorePricesForProduct(
  pb: PocketBase,
  productId: string,
): Promise<ProductPrice[]> {
  try {
    return await pb.collection(BISNIS_COLLECTIONS.productPrices).getFullList<ProductPrice>({
      filter: `product = "${escId(productId)}" && store != ""`,
      sort: "store",
      expand: "store",
      requestKey: null,
    });
  } catch {
    return [];
  }
}

export async function listStorePricesForStore(
  pb: PocketBase,
  storeId: string,
  opts?: { productIds?: string[] },
): Promise<ProductPrice[]> {
  let filter = `store = "${escId(storeId)}" && is_active = true`;
  if (opts?.productIds?.length) {
    const prodFilter = opts.productIds.map((id) => `product = "${escId(id)}"`).join(" || ");
    filter += ` && (${prodFilter})`;
  }
  try {
    return await pb.collection(BISNIS_COLLECTIONS.productPrices).getFullList<ProductPrice>({
      filter,
      expand: "product",
      requestKey: null,
    });
  } catch {
    return [];
  }
}

export async function upsertStoreProductPrice(
  pb: PocketBase,
  input: { productId: string; storeId: string; sellPrice: number },
): Promise<ProductPrice> {
  const { productId, storeId, sellPrice } = input;
  const filter = `product = "${escId(productId)}" && store = "${escId(storeId)}"`;
  let existing: ProductPrice[] = [];
  try {
    existing = await pb.collection(BISNIS_COLLECTIONS.productPrices).getFullList<ProductPrice>({
      filter,
      requestKey: null,
    });
  } catch {
    existing = [];
  }

  const payload = {
    product: productId,
    store: storeId,
    price_level: DEFAULT_PRICE_LEVEL,
    sell_price: Math.max(0, sellPrice),
    is_active: true,
  };

  if (existing[0]) {
    return pb.collection(BISNIS_COLLECTIONS.productPrices).update<ProductPrice>(existing[0].id, payload);
  }
  return pb.collection(BISNIS_COLLECTIONS.productPrices).create<ProductPrice>(payload);
}

export async function deleteStoreProductPrice(pb: PocketBase, priceId: string): Promise<void> {
  await pb.collection(BISNIS_COLLECTIONS.productPrices).delete(priceId);
}
