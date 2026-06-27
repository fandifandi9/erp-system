import type {
  BundleLine,
  BundleLineInput,
  CatalogProduct,
  CatalogProductListItem,
  CatalogProductPayload,
} from "./types";
import type { ProductImageField } from "./product-images";

export type CatalogListParams = {
  q?: string;
  page?: number;
  perPage?: number;
  lifecycle?: "draft" | "active" | "inactive" | "all" | "any";
  sellableOnly?: boolean;
  productType?: "simple" | "bundle";
};

export type CatalogListResponse = {
  ok: boolean;
  items: CatalogProductListItem[];
  totalItems: number;
  totalPages: number;
  page: number;
  viewRole: string;
};

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data.error || "Permintaan katalog gagal."));
  }
  return data;
}

export async function fetchCatalogProducts(
  params?: CatalogListParams,
): Promise<CatalogListResponse> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.perPage) sp.set("perPage", String(params.perPage));
  if (params?.lifecycle) sp.set("lifecycle", params.lifecycle);
  if (params?.sellableOnly) sp.set("sellableOnly", "1");
  if (params?.productType) sp.set("productType", params.productType);

  const res = await fetch(`/api/catalog/products?${sp.toString()}`, { cache: "no-store" });
  return readJson(res);
}

export async function fetchCatalogProduct(id: string): Promise<{ ok: boolean; item: CatalogProduct }> {
  const res = await fetch(`/api/catalog/products/${id}`, { cache: "no-store" });
  return readJson(res);
}

export async function createCatalogProduct(
  payload: CatalogProductPayload,
  images?: Partial<Record<ProductImageField, File | null>>,
): Promise<CatalogProduct> {
  const fd = new FormData();
  Object.entries(payload).forEach(([k, v]) => {
    if (v !== undefined && v !== null) fd.append(k, String(v));
  });
  if (images) {
    for (const [field, file] of Object.entries(images)) {
      if (file) fd.append(field, file);
    }
  }

  const res = await fetch("/api/catalog/products", { method: "POST", body: fd });
  const data = await readJson(res);
  return data.item as CatalogProduct;
}

export async function updateCatalogProduct(
  id: string,
  payload: Partial<CatalogProductPayload>,
  images?: Partial<Record<ProductImageField, File | null>>,
  removals?: Partial<Record<ProductImageField, boolean>>,
): Promise<CatalogProduct> {
  const fd = new FormData();
  Object.entries(payload).forEach(([k, v]) => {
    if (v !== undefined && v !== null) fd.append(k, String(v));
  });
  if (images) {
    for (const [field, file] of Object.entries(images)) {
      if (file) fd.append(field, file);
    }
  }
  if (removals) {
    for (const [field, remove] of Object.entries(removals)) {
      if (remove) fd.append(field, "");
    }
  }

  const res = await fetch(`/api/catalog/products/${id}`, { method: "PATCH", body: fd });
  const data = await readJson(res);
  return data.item as CatalogProduct;
}

export async function activateCatalogProduct(id: string): Promise<CatalogProduct> {
  const res = await fetch(`/api/catalog/products/${id}/activate`, { method: "POST" });
  const data = await readJson(res);
  return data.item as CatalogProduct;
}

export async function archiveCatalogProduct(id: string): Promise<CatalogProduct> {
  const res = await fetch(`/api/catalog/products/${id}/archive`, { method: "POST" });
  const data = await readJson(res);
  return data.item as CatalogProduct;
}

export async function fetchBundleLines(productId: string): Promise<BundleLine[]> {
  const res = await fetch(`/api/catalog/products/${productId}/bundle-lines`, { cache: "no-store" });
  const data = await readJson(res);
  return data.lines as BundleLine[];
}

export async function saveBundleLines(
  productId: string,
  lines: BundleLineInput[],
): Promise<BundleLine[]> {
  const res = await fetch(`/api/catalog/products/${productId}/bundle-lines`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines }),
  });
  const data = await readJson(res);
  return data.lines as BundleLine[];
}

export async function fetchBundlesEstimatedGlobalQty(
  bundleIds: string[],
): Promise<Record<string, number>> {
  if (bundleIds.length === 0) return {};
  const res = await fetch("/api/catalog/bundles/estimated-stock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bundleIds }),
    cache: "no-store",
  });
  const data = (await readJson(res)) as { qty?: Record<string, number> };
  return data.qty ?? {};
}

export async function fetchProductAvailability(
  productId: string,
  warehouseId: string,
): Promise<{ available: number; product_type: string; component_count?: number }> {
  const sp = new URLSearchParams();
  if (warehouseId) sp.set("warehouse", warehouseId);
  const res = await fetch(`/api/catalog/products/${productId}/availability?${sp}`, {
    cache: "no-store",
  });
  return readJson(res);
}

export async function resolveCatalogSellPrice(
  productId: string,
  storeId?: string,
): Promise<{ sellPrice: number; source: "store" | "global" }> {
  const sp = new URLSearchParams({ product: productId });
  if (storeId) sp.set("store", storeId);
  const res = await fetch(`/api/catalog/resolve-price?${sp}`, { cache: "no-store" });
  return readJson(res);
}

export async function resolveCatalogSellPricesBulk(
  productIds: string[],
  storeId?: string,
): Promise<Record<string, { sellPrice: number; source: string }>> {
  if (productIds.length === 0) return {};
  const res = await fetch("/api/catalog/resolve-price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productIds, storeId }),
    cache: "no-store",
  });
  const data = await readJson(res) as { prices?: Record<string, { sellPrice: number; source: string }> };
  return data.prices ?? {};
}

export async function fetchStorePrices(params: {
  storeId: string;
  q?: string;
}): Promise<{
  items: Array<{ id: string; product: string; sell_price: number }>;
  priceByProduct: Record<string, { id: string; product: string; sell_price: number }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    sell_price?: number;
    product_type?: string;
  }>;
}> {
  const sp = new URLSearchParams({ store: params.storeId });
  if (params.q) sp.set("q", params.q);
  const res = await fetch(`/api/catalog/store-prices?${sp}`, { cache: "no-store" });
  return readJson(res);
}

export async function saveStoreProductPrice(input: {
  productId: string;
  storeId: string;
  sellPrice: number;
}) {
  const res = await fetch("/api/catalog/store-prices", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: input.productId,
      storeId: input.storeId,
      sellPrice: input.sellPrice,
    }),
  });
  return readJson(res);
}

export async function fetchProductStorePrices(productId: string) {
  const res = await fetch(`/api/catalog/products/${productId}/prices`, { cache: "no-store" });
  return readJson(res) as Promise<{ ok: boolean; items: Array<{ id: string; store?: string; sell_price: number; expand?: { store?: { id: string; name: string } } }> }>;
}

export async function saveProductStorePrice(
  productId: string,
  input: { storeId: string; sellPrice: number } | { deletePriceId: string },
) {
  const res = await fetch(`/api/catalog/products/${productId}/prices`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      "deletePriceId" in input
        ? { deletePriceId: input.deletePriceId }
        : { storeId: input.storeId, sellPrice: input.sellPrice },
    ),
  });
  return readJson(res);
}

export async function fetchMpMappings(params?: { storeId?: string; accountId?: string; q?: string }) {
  const sp = new URLSearchParams();
  if (params?.storeId) sp.set("store", params.storeId);
  if (params?.accountId) sp.set("account", params.accountId);
  if (params?.q) sp.set("q", params.q);
  const res = await fetch(`/api/catalog/mp-mappings?${sp}`, { cache: "no-store" });
  return readJson(res) as Promise<{
    ok: boolean;
    items: Array<{
      id: string;
      mp_sku: string;
      mp_product_name?: string;
      product: string;
      is_active: boolean;
      store_channel_account?: string;
      expand?: { product?: { id: string; sku: string; name: string } };
    }>;
  }>;
}

export async function createMpMappingApi(input: {
  store_channel_account: string;
  mp_sku: string;
  mp_product_name?: string;
  product: string;
}) {
  const res = await fetch("/api/catalog/mp-mappings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(res);
}

export async function updateMpMappingApi(
  id: string,
  input: Partial<{ mp_sku: string; mp_product_name: string; product: string; is_active: boolean }>,
) {
  const res = await fetch(`/api/catalog/mp-mappings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(res);
}

export async function deleteMpMappingApi(id: string) {
  const res = await fetch(`/api/catalog/mp-mappings/${id}`, { method: "DELETE" });
  return readJson(res);
}

export async function fetchCatalogChannelAccounts(storeId?: string) {
  const sp = new URLSearchParams();
  if (storeId) sp.set("store", storeId);
  const res = await fetch(`/api/catalog/store-channel-accounts?${sp}`, { cache: "no-store" });
  return readJson(res) as Promise<{
    ok: boolean;
    items: Array<{
      id: string;
      account_name: string;
      store: string;
      channel: string;
      is_active: boolean;
      expand?: {
        store?: { id: string; name: string };
        channel?: { id: string; name: string };
        seller_tier?: { id: string; label: string };
      };
    }>;
  }>;
}
