/**
 * In-memory cache for master data that rarely changes between navigations.
 * TTL 5 minutes — no persistence, no schema change.
 */

const TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = { data: T; at: number };

const store = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const row = store.get(key);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return row.data as T;
}

function setCached<T>(key: string, data: T): T {
  store.set(key, { data, at: Date.now() });
  return data;
}

async function cachedFetch<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== null) return hit;
  const data = await loader();
  return setCached(key, data);
}

export function invalidateMasterDataCache(key?: string) {
  if (key) store.delete(key);
  else store.clear();
}

export async function getCachedSalesStores(loader: () => Promise<import("./types").Store[]>) {
  return cachedFetch("sales-stores", loader);
}

/** Panggil setelah create/update/delete toko agar dropdown penjualan ikut terbaru. */
export function invalidateSalesStoresCache() {
  store.delete("sales-stores");
  store.delete("all-stores");
}

export async function getCachedWarehouses(loader: () => Promise<import("@/lib/inventory/types").InvWarehouse[]>) {
  return cachedFetch("warehouses-active", loader);
}

export async function getCachedTaxRates(loader: () => Promise<import("./types").TaxRate[]>) {
  return cachedFetch("tax-rates", loader);
}

export async function getCachedPaymentTerms(loader: () => Promise<import("./types").PaymentTerm[]>) {
  return cachedFetch("payment-terms", loader);
}

export async function getCachedPaymentMethods(loader: () => Promise<import("./types").PaymentMethodSetting[]>) {
  return cachedFetch("payment-methods", loader);
}

export async function getCachedCompanyProfiles(loader: () => Promise<import("./types").CompanyProfile[]>) {
  return cachedFetch("company-profiles", loader);
}

export async function getCachedAllStores(loader: () => Promise<import("./types").Store[]>) {
  return cachedFetch("all-stores", loader);
}
