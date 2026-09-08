import type { Store } from "./types";
import { ENTITY_WAREHOUSE_ROLE, SALES_WAREHOUSE_ROLE } from "./warehouse-categories";

type WarehouseRow = { id?: string; store?: string; warehouse_role?: string };

function normName(s: string) {
  return s.trim().toLowerCase();
}

/** Nama toko = nama entitas di master → placeholder, bukan toko penjualan. */
export function entityPlaceholderStoreNames(profiles: { company_name: string }[]): Set<string> {
  return new Set(profiles.map((p) => normName(p.company_name)));
}

/** Scope entitas: toko milik entitas + toko legacy tanpa field company. */
export function filterSalesStoresByCompany(stores: Store[], companyId?: string): Store[] {
  if (!companyId) return stores;
  return stores.filter((s) => !s.company || s.company === companyId);
}

/** Toko penjualan — bukan placeholder entitas (is_primary / nama = PT). */
export function filterStoresForSales(
  stores: Store[],
  warehouses: WarehouseRow[],
  entityNames?: Set<string>,
): Store[] {
  const retailStoreIds = new Set(
    warehouses
      .filter((w) => w.warehouse_role === SALES_WAREHOUSE_ROLE && w.store)
      .map((w) => w.store!),
  );
  const mainWhIds = new Set(
    warehouses.filter((w) => w.warehouse_role === ENTITY_WAREHOUSE_ROLE && w.id).map((w) => w.id!),
  );

  return stores.filter((s) => {
    if (!s.is_active || s.is_primary) return false;
    if (entityNames?.has(normName(s.name))) return false;
    if (retailStoreIds.has(s.id)) return true;
    if (s.default_warehouse && !mainWhIds.has(s.default_warehouse)) return true;
    return true;
  });
}
