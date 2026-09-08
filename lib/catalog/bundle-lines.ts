import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { getCatalogPb } from "./api-server";
import { touchCatalogProductUpdatedAt } from "./catalog-meta";
import { validateBundleLineInput, validateBundleForActivation, validateBundleRetailStockForActivation } from "./bundle-guards";
import { normalizeLifecycleStatus } from "./product-lifecycle";
import type { BundleLine, BundleLineInput, CatalogProduct } from "./types";

function escId(id: string): string {
  return id.replace(/"/g, '\\"');
}

export async function fetchBundleLines(pb: PocketBase, bundleProductId: string): Promise<BundleLine[]> {
  const res = await pb.collection(INV_COLLECTIONS.productBundleLines).getFullList<BundleLine>({
    filter: `bundle_product = "${escId(bundleProductId)}"`,
    sort: "sort_order,created",
    expand: "component_product",
    requestKey: null,
  });
  return res;
}

export async function loadBundleComponentsMap(
  pb: PocketBase,
  bundleProductIds: string[],
): Promise<Map<string, BundleLine[]>> {
  const map = new Map<string, BundleLine[]>();
  const unique = [...new Set(bundleProductIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const filter = unique.map((id) => `bundle_product = "${escId(id)}"`).join(" || ");
  // Tanpa expand component_product — expand sering 403 untuk non-admin.
  const rows = await pb.collection(INV_COLLECTIONS.productBundleLines).getFullList<BundleLine>({
    filter: `(${filter}) && is_active != false`,
    sort: "sort_order,created",
    requestKey: null,
  });

  for (const row of rows) {
    const list = map.get(row.bundle_product) ?? [];
    list.push(row);
    map.set(row.bundle_product, list);
  }
  return map;
}

async function assertBundleProduct(pb: PocketBase, bundleProductId: string): Promise<CatalogProduct> {
  const product = await pb.collection(INV_COLLECTIONS.products).getOne<CatalogProduct>(bundleProductId);
  if ((product.product_type ?? "simple") !== "bundle") {
    throw new Error("Produk ini bukan tipe bundle. Ubah product_type ke bundle terlebih dahulu.");
  }
  return product;
}

export async function getBundleLinesForCatalog(bundleProductId: string): Promise<BundleLine[]> {
  const pb = await getCatalogPb();
  await assertBundleProduct(pb, bundleProductId);
  return fetchBundleLines(pb, bundleProductId);
}

export async function replaceBundleLines(
  bundleProductId: string,
  inputs: BundleLineInput[],
): Promise<BundleLine[]> {
  const pb = await getCatalogPb();
  const bundle = await assertBundleProduct(pb, bundleProductId);

  const seen = new Set<string>();
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (seen.has(input.component_product)) {
      throw new Error("Komponen duplikat dalam satu bundle.");
    }
    seen.add(input.component_product);

    const component = await pb
      .collection(INV_COLLECTIONS.products)
      .getOne<CatalogProduct>(input.component_product);
    const guard = validateBundleLineInput({
      bundleProductId,
      componentProductId: input.component_product,
      qty: input.qty,
      component,
    });
    if (!guard.ok) throw new Error(guard.reason);
  }

  const existing = await fetchBundleLines(pb, bundleProductId);
  for (const row of existing) {
    await pb.collection(INV_COLLECTIONS.productBundleLines).delete(row.id);
  }

  const created: BundleLine[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const row = await pb.collection(INV_COLLECTIONS.productBundleLines).create<BundleLine>({
      bundle_product: bundleProductId,
      component_product: input.component_product,
      qty: input.qty,
      sort_order: input.sort_order ?? i,
      is_active: input.is_active !== false,
    });
    created.push(row);
  }

  if (normalizeLifecycleStatus(bundle) === "active") {
    const withExpand = await fetchBundleLines(pb, bundleProductId);
    const activation = validateBundleForActivation(bundle, withExpand);
    if (!activation.ok) {
      await pb.collection(INV_COLLECTIONS.products).update(bundleProductId, {
        lifecycle_status: "draft",
        is_active: false,
      });
    }
  }

  await touchCatalogProductUpdatedAt(pb, bundleProductId);
  return fetchBundleLines(pb, bundleProductId);
}

export async function assertBundleCanActivate(bundleProductId: string): Promise<void> {
  const pb = await getCatalogPb();
  const bundle = await pb.collection(INV_COLLECTIONS.products).getOne<CatalogProduct>(bundleProductId);
  const lines = await fetchBundleLines(pb, bundleProductId);
  const result = validateBundleForActivation(bundle, lines);
  if (!result.ok) throw new Error(result.reason);

  const retail = await validateBundleRetailStockForActivation(lines);
  if (!retail.ok) throw new Error(retail.reason);
}
