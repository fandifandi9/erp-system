import type PocketBase from "pocketbase";
import { computeBundleAvailableFromStockMap } from "@/lib/catalog/bundle-expand";
import { loadBundleComponentsMap } from "@/lib/catalog/bundle-lines";
import { resolveSellPricesForProducts } from "@/lib/catalog/product-price";
import { findProductByBarcode } from "@/lib/inventory/product-lookup";
import { fetchStockMapByWarehouse } from "@/lib/inventory/stock-balances";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { InvProduct } from "@/lib/inventory/types";

export type PosProductHit = {
  id: string;
  sku: string;
  name: string;
  sellPrice: number;
  stock?: number;
  imageUrl?: string | null;
  requiresSerial?: boolean;
  barcode?: string;
};

export function posProductImageUrl(recordId: string, image?: string | null): string | null {
  if (!image?.trim()) return null;
  const base = (process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/api/files/inv_products/${recordId}/${encodeURIComponent(image.trim())}`;
}

export async function resolvePosProductByScan(
  adminPb: PocketBase,
  code: string,
): Promise<InvProduct | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  return findProductByBarcode(adminPb, trimmed);
}

export async function mapProductsToPosHits(
  adminPb: PocketBase,
  products: InvProduct[],
  opts?: { warehouseId?: string; storeId?: string },
): Promise<PosProductHit[]> {
  const warehouseId = opts?.warehouseId?.trim() ?? "";
  const storeId = opts?.storeId?.trim() ?? "";

  let stockMap: Record<string, number> = {};
  if (warehouseId) {
    stockMap = await fetchStockMapByWarehouse(warehouseId);
  }

  const bundleIds = products
    .filter((p) => (p as { product_type?: string }).product_type === "bundle")
    .map((p) => p.id);
  const bundleComponents =
    bundleIds.length > 0 ? await loadBundleComponentsMap(adminPb, bundleIds) : new Map();

  const resolvedPrices = await resolveSellPricesForProducts(
    adminPb,
    products.map((p) => p.id),
    storeId || undefined,
  );

  return products.map((p) => {
    const sell =
      resolvedPrices.get(p.id)?.sellPrice ?? Number((p as { sell_price?: number }).sell_price) ?? 0;
    const productType = (p as { product_type?: string }).product_type ?? "simple";
    let stock: number | undefined;
    if (warehouseId) {
      stock =
        productType === "bundle"
          ? computeBundleAvailableFromStockMap(bundleComponents.get(p.id) ?? [], stockMap)
          : stockMap[p.id] ?? 0;
    }
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      barcode: p.barcode,
      imageUrl: posProductImageUrl(p.id, p.image),
      sellPrice: sell,
      stock,
      requiresSerial: !!(p as { requires_serial?: boolean }).requires_serial,
    };
  });
}

export async function searchPosProducts(
  adminPb: PocketBase,
  q: string,
  opts?: { warehouseId?: string; storeId?: string; limit?: number },
): Promise<PosProductHit[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const esc = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const baseQ = `(sku ~ "${esc}" || name ~ "${esc}" || barcode ~ "${esc}")`;
  const limit = opts?.limit ?? 30;

  let products;
  try {
    products = await adminPb.collection(INV_COLLECTIONS.products).getList(1, limit, {
      filter: `${baseQ} && lifecycle_status = "active"`,
      sort: "name",
      fields: "id,sku,name,barcode,sell_price,image,requires_serial,lifecycle_status,product_type",
    });
  } catch {
    products = await adminPb.collection(INV_COLLECTIONS.products).getList(1, limit, {
      filter: `${baseQ} && is_active = true`,
      sort: "name",
      fields: "id,sku,name,barcode,sell_price,image,requires_serial",
    });
  }

  return mapProductsToPosHits(
    adminPb,
    products.items as unknown as InvProduct[],
    opts,
  );
}
