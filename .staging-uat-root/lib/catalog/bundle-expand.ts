import type PocketBase from "pocketbase";
import { fetchStockMapByWarehouse } from "@/lib/inventory/stock-balances";
import { fetchProductsStockInSalesWarehouses } from "@/lib/inventory/sales-warehouses";
import { getCatalogPb } from "./api-server";
import { loadBundleComponentsMap } from "./bundle-lines";
import { normalizeLifecycleStatus } from "./product-lifecycle";
import type { CatalogProduct, SaleLineInput, StockLineOutput } from "./types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

export function computeBundleAvailableFromStockMap(
  lines: { component_product: string; qty: number }[],
  stockMap: Record<string, number>,
): number {
  if (lines.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const need = Number(line.qty) || 0;
    if (need <= 0) continue;
    const onHand = stockMap[line.component_product] ?? 0;
    min = Math.min(min, Math.floor(onHand / need));
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

/** Estimasi qty bundle global (min stok komponen ÷ qty) — server-side only. */
export async function fetchBundlesEstimatedGlobalQty(
  bundleIds: string[],
): Promise<Record<string, number>> {
  const unique = [...new Set(bundleIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const pb = await getCatalogPb();
  const map = await loadBundleComponentsMap(pb, unique);
  const componentIds = [
    ...new Set(
      [...map.values()].flatMap((lines) => lines.map((l) => l.component_product)),
    ),
  ];

  const stockMap = await fetchProductsStockInSalesWarehouses(pb, componentIds);

  const result: Record<string, number> = {};
  for (const bundleId of unique) {
    const lines = map.get(bundleId) ?? [];
    result[bundleId] = computeBundleAvailableFromStockMap(
      lines.map((l) => ({ component_product: l.component_product, qty: l.qty })),
      stockMap,
    );
  }
  return result;
}

export async function computeBundleAvailableQty(
  pb: PocketBase,
  bundleProductId: string,
  warehouseId: string,
): Promise<number> {
  const map = await loadBundleComponentsMap(pb, [bundleProductId]);
  const lines = map.get(bundleProductId) ?? [];
  if (!warehouseId || lines.length === 0) return 0;
  const stockMap = await fetchStockMapByWarehouse(warehouseId);
  return computeBundleAvailableFromStockMap(lines, stockMap);
}

export async function expandLinesForStock(
  pb: PocketBase,
  lines: SaleLineInput[],
): Promise<StockLineOutput[]> {
  const productIds = [...new Set(lines.map((l) => l.product).filter(Boolean))];
  if (productIds.length === 0) return [];

  const products = await pb.collection(INV_COLLECTIONS.products).getFullList<CatalogProduct>({
    filter: productIds.map((id) => `id = "${id.replace(/"/g, '\\"')}"`).join(" || "),
    fields: "id,sku,name,product_type,lifecycle_status,is_active",
    requestKey: null,
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const bundleIds = products.filter((p) => (p.product_type ?? "simple") === "bundle").map((p) => p.id);
  const bundleMap = await loadBundleComponentsMap(pb, bundleIds);

  const merged = new Map<string, StockLineOutput>();

  const addStock = (row: StockLineOutput) => {
    const key = `${row.product}:${row.source.kind}:${row.source.bundle_product_id ?? ""}`;
    const prev = merged.get(key);
    if (prev) {
      prev.qty += row.qty;
      return;
    }
    merged.set(key, { ...row });
  };

  for (const line of lines) {
    const qty = Number(line.qty) || 0;
    if (!line.product || qty <= 0) continue;

    const product = productById.get(line.product);
    const type = product?.product_type ?? "simple";

    if (type !== "bundle") {
      addStock({
        product: line.product,
        qty,
        source: {
          kind: "simple",
          parent_line_id: line.sales_order_line_id,
        },
      });
      continue;
    }

    const components = bundleMap.get(line.product) ?? [];
    if (components.length === 0) {
      throw new Error(
        `Bundle "${product?.name || product?.sku || line.product}" belum punya komponen.`,
      );
    }

    for (const comp of components) {
      const compQty = (Number(comp.qty) || 0) * qty;
      if (compQty <= 0) continue;
      addStock({
        product: comp.component_product,
        qty: compQty,
        source: {
          kind: "bundle_component",
          bundle_product_id: line.product,
          bundle_qty: qty,
          parent_line_id: line.sales_order_line_id,
        },
      });
    }
  }

  return [...merged.values()];
}

export function canExpandProductForStock(product: CatalogProduct): boolean {
  const type = product.product_type ?? "simple";
  if (type === "simple") return normalizeLifecycleStatus(product) === "active";
  return type === "bundle";
}
