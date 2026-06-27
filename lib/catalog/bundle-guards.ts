import type { BundleLine, CatalogProduct } from "./types";
import { normalizeLifecycleStatus } from "./product-lifecycle";
import { computeBundleAvailableFromStockMap } from "./bundle-expand";
import { fetchProductsStockInSalesWarehouses } from "@/lib/inventory/sales-warehouses";
import { getCatalogPb } from "./api-server";

export type BundleGuardResult = { ok: true } | { ok: false; reason: string };

export function validateBundleLineInput(input: {
  bundleProductId: string;
  componentProductId: string;
  qty: number;
  component?: Pick<CatalogProduct, "product_type" | "lifecycle_status" | "sku" | "name">;
}): BundleGuardResult {
  if (!input.componentProductId) {
    return { ok: false, reason: "Komponen wajib dipilih." };
  }
  if (input.bundleProductId === input.componentProductId) {
    return { ok: false, reason: "Produk bundle tidak boleh menjadi komponen dirinya sendiri." };
  }
  if (!Number.isFinite(input.qty) || input.qty <= 0) {
    return { ok: false, reason: "Qty komponen harus lebih dari 0." };
  }
  if (input.component) {
    if ((input.component.product_type ?? "simple") === "bundle") {
      return { ok: false, reason: "Bundle bersarang belum didukung — pilih produk simple." };
    }
    const status = normalizeLifecycleStatus(input.component);
    if (status === "inactive") {
      const label = input.component.name || input.component.sku || "Komponen";
      return { ok: false, reason: `"${label}" nonaktif dan tidak bisa jadi komponen bundle.` };
    }
  }
  return { ok: true };
}

export function validateBundleForActivation(
  bundle: Pick<CatalogProduct, "product_type" | "sku" | "name" | "lifecycle_status" | "is_active">,
  lines: BundleLine[],
): BundleGuardResult {
  if ((bundle.product_type ?? "simple") !== "bundle") {
    return { ok: false, reason: "Produk bukan tipe bundle." };
  }
  const activeLines = lines.filter((l) => l.is_active !== false);
  if (activeLines.length === 0) {
    return {
      ok: false,
      reason: `Bundle "${bundle.name || bundle.sku}" belum punya komponen aktif.`,
    };
  }
  for (const line of activeLines) {
    const comp = line.expand?.component_product;
    if (!comp) continue;
    if ((comp.product_type ?? "simple") === "bundle") {
      return { ok: false, reason: "Bundle tidak boleh berisi produk bundle lain." };
    }
    const status = normalizeLifecycleStatus(comp);
    if (status !== "active") {
      return {
        ok: false,
        reason: `Komponen "${comp.name || comp.sku}" harus aktif sebelum bundle diaktifkan.`,
      };
    }
  }
  return { ok: true };
}

/** Aktivasi bundle hanya jika komponen punya stok di gudang penjualan retail (min 1 paket). */
export async function validateBundleRetailStockForActivation(
  lines: BundleLine[],
): Promise<BundleGuardResult> {
  const activeLines = lines.filter((l) => l.is_active !== false);
  if (activeLines.length === 0) {
    return { ok: true };
  }

  const pb = await getCatalogPb();
  const componentIds = activeLines.map((l) => l.component_product);
  const stockMap = await fetchProductsStockInSalesWarehouses(pb, componentIds);
  const available = computeBundleAvailableFromStockMap(
    activeLines.map((l) => ({ component_product: l.component_product, qty: l.qty })),
    stockMap,
  );

  if (available < 1) {
    return {
      ok: false,
      reason:
        "Komponen belum tersedia di gudang penjualan retail — transfer stok ke toko dulu sebelum bundle diaktifkan.",
    };
  }
  return { ok: true };
}

export function isBundleReadyForSale(
  bundle: Pick<CatalogProduct, "product_type" | "lifecycle_status" | "is_active" | "sku" | "name">,
  lines: BundleLine[],
): boolean {
  if ((bundle.product_type ?? "simple") !== "bundle") return false;
  if (normalizeLifecycleStatus(bundle) !== "active") return false;
  return validateBundleForActivation(bundle, lines).ok;
}
