export type StoreWarehouseRef = {
  id: string;
  name: string;
  code: string;
  store?: string;
};

export type StoreRef = {
  id: string;
  default_warehouse?: string;
};

/** Gudang yang termasuk scope toko aktif (relasi store atau default_warehouse). */
export function warehousesForStore(
  storeId: string,
  stores: StoreRef[],
  allWarehouses: StoreWarehouseRef[],
): StoreWarehouseRef[] {
  const linked = allWarehouses.filter((w) => w.store === storeId);
  if (linked.length > 0) return linked;

  const store = stores.find((s) => s.id === storeId);
  if (store?.default_warehouse) {
    const def = allWarehouses.find((w) => w.id === store.default_warehouse);
    if (def) return [def];
  }

  return allWarehouses;
}
