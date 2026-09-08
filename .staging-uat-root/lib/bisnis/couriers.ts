import { BISNIS_COLLECTIONS, type Courier, type CourierService } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;

export type CouriersCatalog = {
  couriers: Courier[];
  servicesByCourier: Record<string, CourierService[]>;
};

type CacheRow<T> = { data: T; at: number };

const couriersCache = new Map<string, CacheRow<Courier[]>>();
const servicesCache = new Map<string, CacheRow<CourierService[]>>();
const catalogCache = new Map<string, CacheRow<CouriersCatalog>>();
const catalogInflight = new Map<string, Promise<CouriersCatalog>>();

function couriersKey(activeOnly: boolean) {
  return activeOnly ? "active" : "all";
}

function servicesKey(courierId: string, activeOnly: boolean) {
  return `${courierId}:${activeOnly ? "active" : "all"}`;
}

function readCache<T>(map: Map<string, CacheRow<T>>, key: string): T | null {
  const row = map.get(key);
  if (!row) return null;
  if (Date.now() - row.at > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return row.data;
}

export function peekCouriersCache(activeOnly = true): Courier[] | null {
  return readCache(couriersCache, couriersKey(activeOnly));
}

export function peekCouriersCatalogCache(activeOnly = true): CouriersCatalog | null {
  return readCache(catalogCache, couriersKey(activeOnly));
}

export function peekCourierServicesCache(
  courierId: string,
  activeOnly = true,
): CourierService[] | null {
  if (!courierId) return null;
  return readCache(servicesCache, servicesKey(courierId, activeOnly));
}

export function invalidateCouriersCache(): void {
  couriersCache.clear();
  servicesCache.clear();
  catalogCache.clear();
  catalogInflight.clear();
}

function seedCachesFromCatalog(catalog: CouriersCatalog, activeOnly: boolean): void {
  const at = Date.now();
  const key = couriersKey(activeOnly);
  catalogCache.set(key, { data: catalog, at });
  couriersCache.set(key, { data: catalog.couriers, at });
  for (const [courierId, services] of Object.entries(catalog.servicesByCourier)) {
    servicesCache.set(servicesKey(courierId, activeOnly), { data: services, at });
  }
}

/** Prefetch katalog ekspedisi + layanan sekaligus (panggil saat halaman dibuka). */
export function prefetchCouriers(activeOnly = true): void {
  void fetchCouriersCatalogCached(activeOnly).catch(() => {});
}

export async function fetchCouriersCatalogCached(activeOnly = true): Promise<CouriersCatalog> {
  const key = couriersKey(activeOnly);
  const hit = readCache(catalogCache, key);
  if (hit) return hit;

  let inflight = catalogInflight.get(key);
  if (!inflight) {
    inflight = fetchCouriersCatalog(activeOnly)
      .then((data) => {
        seedCachesFromCatalog(data, activeOnly);
        catalogInflight.delete(key);
        return data;
      })
      .catch((e) => {
        catalogInflight.delete(key);
        throw e;
      });
    catalogInflight.set(key, inflight);
  }
  return inflight;
}

async function fetchCouriersCatalog(activeOnly = true): Promise<CouriersCatalog> {
  return apiJson<CouriersCatalog>(`/api/bisnis/couriers/catalog?active=${activeOnly ? "1" : "0"}`);
}

export async function fetchCouriersCached(activeOnly = true): Promise<Courier[]> {
  const catalog = peekCouriersCatalogCache(activeOnly);
  if (catalog) return catalog.couriers;
  const loaded = await fetchCouriersCatalogCached(activeOnly);
  return loaded.couriers;
}

export async function fetchCourierServicesCached(
  courierId: string,
  activeOnly = true,
): Promise<CourierService[]> {
  const catalog = peekCouriersCatalogCache(activeOnly);
  if (catalog?.servicesByCourier[courierId]) {
    return catalog.servicesByCourier[courierId];
  }

  const key = servicesKey(courierId, activeOnly);
  const hit = readCache(servicesCache, key);
  if (hit) return hit;

  // Layanan belum di cache — muat katalog penuh (satu request) daripada per-kurir.
  const loaded = await fetchCouriersCatalogCached(activeOnly);
  return loaded.servicesByCourier[courierId] ?? [];
}

export function findCourierNameForService(serviceName: string): string {
  const q = serviceName.trim().toLowerCase();
  if (!q) return "";
  const catalog = peekCouriersCatalogCache(true);
  if (!catalog) return "";
  let found = "";
  for (const c of catalog.couriers) {
    const services = catalog.servicesByCourier[c.id] ?? [];
    if (services.some((s) => s.name.trim().toLowerCase() === q)) {
      if (found && found !== c.name) return found;
      found = c.name;
    }
  }
  return found;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Request gagal (${res.status})`);
  }
  return data as T;
}

/** Server-side: pakai admin PB langsung (seed, dll.). */
export async function fetchCouriersServer(
  adminPb: import("pocketbase").default,
  activeOnly = true,
): Promise<Courier[]> {
  return adminPb.collection(BISNIS_COLLECTIONS.couriers).getFullList<Courier>({
    sort: "name",
    filter: activeOnly ? "is_active = true" : undefined,
    requestKey: null,
  });
}

export async function fetchCouriers(activeOnly = true): Promise<Courier[]> {
  return apiJson<Courier[]>(`/api/bisnis/couriers?active=${activeOnly ? "1" : "0"}`);
}

export async function createCourier(
  data: Partial<Courier> | FormData,
): Promise<Courier> {
  if (data instanceof FormData) {
    const res = await fetch("/api/bisnis/couriers", {
      method: "POST",
      credentials: "include",
      body: data,
    });
    const json = (await res.json()) as Courier & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Request gagal (${res.status})`);
    invalidateCouriersCache();
    return json;
  }
  const row = await apiJson<Courier>("/api/bisnis/couriers", {
    method: "POST",
    body: JSON.stringify(data),
  });
  invalidateCouriersCache();
  return row;
}

export async function updateCourier(
  id: string,
  data: Partial<Courier> | FormData,
): Promise<Courier> {
  if (data instanceof FormData) {
    const res = await fetch(`/api/bisnis/couriers/${id}`, {
      method: "PATCH",
      credentials: "include",
      body: data,
    });
    const json = (await res.json()) as Courier & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Request gagal (${res.status})`);
    invalidateCouriersCache();
    return json;
  }
  const row = await apiJson<Courier>(`/api/bisnis/couriers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  invalidateCouriersCache();
  return row;
}

export async function deleteCourier(id: string): Promise<boolean> {
  await apiJson<{ ok: boolean }>(`/api/bisnis/couriers/${id}`, { method: "DELETE" });
  invalidateCouriersCache();
  return true;
}

export async function fetchCourierServices(
  courierId?: string,
  activeOnly = true,
): Promise<CourierService[]> {
  const q = new URLSearchParams({ active: activeOnly ? "1" : "0" });
  if (courierId) q.set("courier", courierId);
  return apiJson<CourierService[]>(`/api/bisnis/courier-services?${q}`);
}

export async function createCourierService(
  data: Partial<CourierService>,
): Promise<CourierService> {
  const row = await apiJson<CourierService>("/api/bisnis/courier-services", {
    method: "POST",
    body: JSON.stringify(data),
  });
  invalidateCouriersCache();
  return row;
}

export async function updateCourierService(
  id: string,
  data: Partial<CourierService>,
): Promise<CourierService> {
  const row = await apiJson<CourierService>(`/api/bisnis/courier-services/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  invalidateCouriersCache();
  return row;
}

export async function deleteCourierService(id: string): Promise<boolean> {
  await apiJson<{ ok: boolean }>(`/api/bisnis/courier-services/${id}`, { method: "DELETE" });
  invalidateCouriersCache();
  return true;
}
