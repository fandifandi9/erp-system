/**
 * WMS hanya membaca master produk pusat (inv_products).
 * Tidak ada tabel produk WMS terpisah.
 */
import { pb } from "@/lib/pocketbase";
import { findProductByBarcode } from "@/lib/inventory/product-lookup";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { InvProduct } from "@/lib/inventory/types";

export type MasterProductView = {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  uom?: string;
  categoryName?: string;
  brandName?: string;
  image?: string;
  minStock?: number;
};

export function toMasterProductView(p: InvProduct): MasterProductView {
  return {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    description: p.description,
    uom: p.uom || "pcs",
    categoryName: p.expand?.category?.name,
    brandName: p.expand?.brand?.name,
    image: p.image,
    minStock: p.min_stock,
  };
}

export async function fetchMasterProducts(opts?: { q?: string; limit?: number }) {
  const limit = opts?.limit ?? 500;
  let filter = "is_active = true";
  const q = (opts?.q || "").trim();
  if (q) {
    const esc = q.replace(/"/g, '\\"');
    filter += ` && (sku ~ "${esc}" || name ~ "${esc}" || barcode ~ "${esc}")`;
  }
  const res = await pb.collection(INV_COLLECTIONS.products).getList(1, limit, {
    sort: "name",
    filter,
    expand: "category,brand",
    requestKey: null,
  });
  return (res.items as unknown as InvProduct[]).map(toMasterProductView);
}

export async function fetchMasterProduct(id: string): Promise<MasterProductView | null> {
  try {
    const p = await pb.collection(INV_COLLECTIONS.products).getOne<InvProduct>(id, {
      expand: "category,brand",
      requestKey: null,
    });
    return toMasterProductView(p as unknown as InvProduct);
  } catch {
    return null;
  }
}

/** Scan barcode / SKU — validasi wajib untuk operasi WMS. */
export async function resolveProductByScan(code: string): Promise<MasterProductView | null> {
  const hit = await findProductByBarcode(pb, code.trim());
  return hit ? toMasterProductView(hit) : null;
}
