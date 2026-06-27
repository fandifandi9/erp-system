import type PocketBase from "pocketbase";
import { expandLinesForStock } from "./bundle-expand";
import type { SaleLineInput, StockLineOutput } from "./types";

export type SaleLineForStock = SaleLineInput & {
  productName?: string;
};

function aggregateExpanded(
  expanded: StockLineOutput[],
): { product: string; qty: number }[] {
  const map = new Map<string, number>();
  for (const row of expanded) {
    map.set(row.product, (map.get(row.product) ?? 0) + row.qty);
  }
  return [...map.entries()].map(([product, qty]) => ({ product, qty }));
}

/** Expand penjualan → baris mutasi stok (komponen digabung per produk). */
export async function resolveMovementLinesFromSale(
  pb: PocketBase,
  lines: SaleLineForStock[],
): Promise<{ product: string; qty: number }[]> {
  const expanded = await expandLinesForStock(
    pb,
    lines.map((l) => ({
      product: l.product,
      qty: l.qty,
      sales_order_line_id: l.sales_order_line_id,
    })),
  );
  return aggregateExpanded(expanded);
}

/** Validasi stok dengan expand bundle → komponen. */
export async function validateStockForSaleExpanded(
  pb: PocketBase,
  warehouseId: string,
  lines: SaleLineForStock[],
  _opts?: { warehouseName?: string },
): Promise<string | null> {
  if (!warehouseId) {
    return "Gudang toko belum dipilih — stok tidak bisa dicek.";
  }
  if (lines.length === 0) return null;
  // Penjualan boleh lanjut meski stok 0 / minus (backorder). Stok akan turun saat mutasi diposting.
  void pb;
  return null;
}

/** Expand retur / bucket produk → komponen untuk mutasi stok. */
export async function resolveReturnLinesFromSale(
  pb: PocketBase,
  lines: { product: string; qty: number }[],
): Promise<{ product: string; qty: number }[]> {
  return resolveMovementLinesFromSale(
    pb,
    lines.map((l) => ({ product: l.product, qty: l.qty })),
  );
}
