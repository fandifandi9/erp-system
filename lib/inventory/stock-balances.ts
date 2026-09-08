import type PocketBase from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

/** Satu sumber kebenaran stok: koleksi inv_stock_balances (ledger pembelian/penjualan/WMS). */

async function resolveStockPb(): Promise<PocketBase> {
  if (typeof window !== "undefined") {
    return pb;
  }
  const { getInventoryAdminPb } = await import("@/lib/inventory/pb-server");
  return getInventoryAdminPb();
}

function sumBalancesToMap(
  balances: { product?: string; qty_on_hand?: number; qty_available?: number }[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of balances) {
    const productId = String(row.product || "");
    if (!productId) continue;
    const qty = Number(row.qty_on_hand) || 0;
    map[productId] = (map[productId] ?? 0) + qty;
  }
  return map;
}

function buildProductFilter(productIds: string[]): string | null {
  const unique = [...new Set(productIds.filter(Boolean))];
  if (unique.length === 0) return null;
  return unique.map((id) => `product = "${id.replace(/"/g, '\\"')}"`).join(" || ");
}

export async function fetchStockMapByWarehouse(
  warehouseId: string,
): Promise<Record<string, number>> {
  if (!warehouseId) return {};

  const client = await resolveStockPb();
  const balances = await client.collection(INV_COLLECTIONS.balances).getFullList({
    filter: `warehouse = "${warehouseId.replace(/"/g, '\\"')}"`,
    fields: "product,qty_on_hand,qty_available",
    requestKey: null,
  });

  return sumBalancesToMap(
    balances as { product?: string; qty_on_hand?: number; qty_available?: number }[],
  );
}

/** Stok hanya untuk produk yang diminta (picking / validasi). */
export async function fetchStockMapForProducts(
  warehouseId: string,
  productIds: string[],
): Promise<Record<string, number>> {
  if (!warehouseId) return {};

  const productFilter = buildProductFilter(productIds);
  if (!productFilter) return {};

  const client = await resolveStockPb();
  const filter = `warehouse = "${warehouseId.replace(/"/g, '\\"')}" && (${productFilter})`;
  const balances = await client.collection(INV_COLLECTIONS.balances).getFullList({
    filter,
    fields: "product,qty_on_hand,qty_available",
    requestKey: null,
  });

  return sumBalancesToMap(
    balances as { product?: string; qty_on_hand?: number; qty_available?: number }[],
  );
}

/** Total stok produk di semua gudang (untuk daftar produk / ringkasan). */
export async function fetchGlobalStockByProduct(): Promise<Record<string, number>> {
  const client = await resolveStockPb();
  const balances = await client.collection(INV_COLLECTIONS.balances).getFullList({
    fields: "product,qty_on_hand",
    requestKey: null,
  });

  return sumBalancesToMap(
    balances as { product?: string; qty_on_hand?: number; qty_available?: number }[],
  );
}

export function getStockQtyFromMap(
  stockMap: Record<string, number>,
  productId: string,
): number {
  if (!productId) return 0;
  return stockMap[productId] ?? 0;
}
