import type { CatalogProduct, ProductLifecycleStatus } from "./types";
import { normalizeLifecycleStatus } from "./product-lifecycle";

export type ProductGuardResult = { ok: true } | { ok: false; reason: string };

export function isProductSellable(
  product: Pick<CatalogProduct, "lifecycle_status" | "is_active" | "product_type">,
): boolean {
  const status = normalizeLifecycleStatus(product);
  if (status !== "active") return false;
  return true;
}

export function canAddToSalesOrder(
  product: Pick<CatalogProduct, "is_active" | "sku" | "name"> & {
    product_type?: string;
    lifecycle_status?: ProductLifecycleStatus | string;
  },
): ProductGuardResult {
  const status = normalizeLifecycleStatus(
    product as Pick<CatalogProduct, "lifecycle_status" | "is_active" | "product_type">,
  );
  const label = product.name || product.sku || "Produk";

  if (status === "draft") {
    return {
      ok: false,
      reason: `"${label}" masih draft — aktivasi komersial diperlukan sebelum dijual.`,
    };
  }
  if (status === "inactive") {
    return { ok: false, reason: `"${label}" nonaktif dan tidak bisa ditambahkan ke penjualan.` };
  }
  return { ok: true };
}

export function canAddToPos(
  product: Pick<CatalogProduct, "lifecycle_status" | "is_active" | "product_type">,
): boolean {
  return isProductSellable(product);
}

export function lifecycleBlockedReason(status: ProductLifecycleStatus): string | null {
  if (status === "draft") return "Produk masih draft.";
  if (status === "inactive") return "Produk nonaktif.";
  return null;
}
