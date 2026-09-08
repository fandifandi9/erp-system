import type { Store } from "./types";

/**
 * Toko penjualan = semua toko aktif.
 * Penjualan berbasis TOKO (bukan entitas) — semua toko aktif selalu bisa dipilih.
 */
export function filterStoresForSales(stores: Store[]): Store[] {
  return stores.filter((s) => s.is_active);
}
