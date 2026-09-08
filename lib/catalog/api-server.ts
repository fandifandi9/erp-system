import PocketBase from "pocketbase";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import {
  canActivateCatalogProduct,
  createdByRoleSnapshot,
  defaultLifecycleOnCreate,
  resolveCatalogViewRole,
} from "./catalog-access";
import { pickWritableProductFields, stripProductForRole } from "./product-fields";
import { lifecyclePatch, normalizeLifecycleStatus, syncIsActiveFromLifecycle } from "./product-lifecycle";
import {
  appendProductImagesToFormData,
  hasProductImageChanges,
  hasProductImageUploads,
  PRODUCT_IMAGE_FIELDS,
} from "./product-images";
import { catalogUpdatedAtPatch } from "./catalog-meta";
import type { CatalogProduct, CatalogProductPayload, ProductLifecycleStatus } from "./types";

export async function getCatalogPb(): Promise<PocketBase> {
  return getInventoryAdminPb();
}

export function buildCatalogListFilter(opts: {
  q?: string;
  lifecycle?: string;
  sellableOnly?: boolean;
  productType?: "simple" | "bundle";
}): string {
  const parts: string[] = [];
  if (opts.productType === "simple") {
    parts.push('product_type != "bundle"');
  } else if (opts.productType === "bundle") {
    parts.push('product_type = "bundle"');
  }
  if (opts.sellableOnly) {
    parts.push('lifecycle_status = "active"');
  } else if (opts.lifecycle === "all") {
    parts.push('(lifecycle_status = "active" || lifecycle_status = "inactive")');
  } else if (opts.lifecycle === "any") {
    /* semua status termasuk draft — dipakai tab Bundling */
  } else if (opts.lifecycle && opts.lifecycle !== "all") {
    parts.push(`lifecycle_status = "${opts.lifecycle}"`);
  }
  const q = opts.q?.trim();
  if (q) {
    const esc = q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    parts.push(`(sku ~ "${esc}" || name ~ "${esc}" || barcode ~ "${esc}")`);
  }
  return parts.join(" && ");
}

export async function listCatalogProducts(
  user: Record<string, unknown>,
  opts: {
    q?: string;
    page?: number;
    perPage?: number;
    lifecycle?: string;
    sellableOnly?: boolean;
    productType?: "simple" | "bundle";
  },
) {
  const pb = await getCatalogPb();
  const role = resolveCatalogViewRole(user);
  const page = opts.page ?? 1;
  const perPage = Math.min(opts.perPage ?? 50, 200);
  let filter = buildCatalogListFilter(opts);

  try {
    const res = await pb.collection(INV_COLLECTIONS.products).getList(page, perPage, {
      sort: "name",
      filter: filter || undefined,
      expand: "category,brand",
    });
    return {
      items: res.items.map((row) => stripProductForRole(row as unknown as CatalogProduct, role)),
      totalItems: res.totalItems,
      totalPages: res.totalPages,
      page: res.page,
      viewRole: role,
    };
  } catch {
    if (opts.sellableOnly) {
      filter = buildCatalogListFilter({ ...opts, sellableOnly: false, lifecycle: "active" });
      const legacy = filter ? `${filter} && is_active = true` : "is_active = true";
      const res = await pb.collection(INV_COLLECTIONS.products).getList(page, perPage, {
        sort: "name",
        filter: legacy,
        expand: "category,brand",
      });
      return {
        items: res.items.map((row) => stripProductForRole(row as unknown as CatalogProduct, role)),
        totalItems: res.totalItems,
        totalPages: res.totalPages,
        page: res.page,
        viewRole: role,
      };
    }
    throw new Error("Gagal memuat produk katalog.");
  }
}

export async function getCatalogProduct(user: Record<string, unknown>, id: string) {
  const pb = await getCatalogPb();
  const role = resolveCatalogViewRole(user);
  const row = await fetchProductWithExpand(pb, id);
  return { item: stripProductForRole(row as CatalogProduct, role), viewRole: role };
}

async function fetchProductWithExpand(
  pb: PocketBase,
  id: string,
): Promise<CatalogProduct> {
  return pb.collection(INV_COLLECTIONS.products).getOne(id, {
    expand: "category,brand",
  }) as Promise<CatalogProduct>;
}

function parseFormPayload(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const imageFields = new Set<string>(PRODUCT_IMAGE_FIELDS);
  for (const [k, v] of formData.entries()) {
    if (imageFields.has(k)) continue;
    if (typeof v !== "string") continue;
    if (k === "min_stock" || k === "sell_price" || k === "buy_price") {
      out[k] = Number(v) || 0;
      continue;
    }
    if (k === "requires_serial") {
      out[k] = v === "true" || v === "1";
      continue;
    }
    if (k === "category" || k === "brand") {
      out[k] = v.trim() || "";
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function createCatalogProductRecord(
  user: Record<string, unknown>,
  formData: FormData,
) {
  const pb = await getCatalogPb();
  const role = resolveCatalogViewRole(user);
  const raw = parseFormPayload(formData);
  const body = pickWritableProductFields(raw, role) as CatalogProductPayload;

  if (!body.sku?.trim() || !body.name?.trim()) {
    throw new Error("SKU dan nama produk wajib diisi.");
  }

  const requestedStatus = body.lifecycle_status as ProductLifecycleStatus | undefined;
  let lifecycle: ProductLifecycleStatus;
  if (requestedStatus && canActivateCatalogProduct(user)) {
    lifecycle = requestedStatus;
  } else {
    lifecycle = defaultLifecycleOnCreate(user);
  }

  const record: Record<string, unknown> = {
    ...body,
    sku: body.sku.trim(),
    name: body.name.trim(),
    product_type: body.product_type ?? "simple",
    lifecycle_status: lifecycle,
    is_active: syncIsActiveFromLifecycle(lifecycle),
    created_by_role: createdByRoleSnapshot(user),
    ...catalogUpdatedAtPatch(),
  };

  if (lifecycle === "active") {
    Object.assign(record, lifecyclePatch("active", { userId: String(user.id ?? "") }));
  }

  if (hasProductImageUploads(formData)) {
    const fd = new FormData();
    Object.entries(record).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, typeof v === "boolean" ? String(v) : String(v));
    });
    appendProductImagesToFormData(fd, formData);
    const created = await pb.collection(INV_COLLECTIONS.products).create(fd);
    return stripProductForRole(await fetchProductWithExpand(pb, created.id), role);
  }

  const created = await pb.collection(INV_COLLECTIONS.products).create(record);
  return stripProductForRole(await fetchProductWithExpand(pb, created.id), role);
}

export async function updateCatalogProductRecord(
  user: Record<string, unknown>,
  id: string,
  formData: FormData,
) {
  const pb = await getCatalogPb();
  const role = resolveCatalogViewRole(user);
  const existing = await pb.collection(INV_COLLECTIONS.products).getOne(id);
  const raw = parseFormPayload(formData);
  const body = pickWritableProductFields(raw, role);

  if (body.lifecycle_status && !canActivateCatalogProduct(user)) {
    delete body.lifecycle_status;
  }

  const patch: Record<string, unknown> = { ...body, ...catalogUpdatedAtPatch() };
  if (body.lifecycle_status) {
    const status = body.lifecycle_status as ProductLifecycleStatus;
    Object.assign(patch, lifecyclePatch(status, { userId: String(user.id ?? "") }));
  }

  if (hasProductImageChanges(formData)) {
    const fd = new FormData();
    Object.entries(patch).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, typeof v === "boolean" ? String(v) : String(v));
    });
    appendProductImagesToFormData(fd, formData);
    const updated = await pb.collection(INV_COLLECTIONS.products).update(id, fd);
    return stripProductForRole(await fetchProductWithExpand(pb, updated.id), role);
  }

  const updated = await pb.collection(INV_COLLECTIONS.products).update(id, patch);
  return stripProductForRole(await fetchProductWithExpand(pb, updated.id), role);
}

export async function activateCatalogProductRecord(user: Record<string, unknown>, id: string) {
  if (!canActivateCatalogProduct(user)) {
    throw new Error("Anda tidak punya izin mengaktifkan produk untuk dijual.");
  }
  const pb = await getCatalogPb();
  const role = resolveCatalogViewRole(user);
  const existing = await pb.collection(INV_COLLECTIONS.products).getOne<CatalogProduct>(id);
  const status = normalizeLifecycleStatus(existing);
  if (status === "active") {
    return stripProductForRole(await fetchProductWithExpand(pb, id), role);
  }

  if ((existing.product_type ?? "simple") === "bundle") {
    const { assertBundleCanActivate } = await import("./bundle-lines");
    await assertBundleCanActivate(id);
  }

  const updated = await pb.collection(INV_COLLECTIONS.products).update(
    id,
    { ...lifecyclePatch("active", { userId: String(user.id ?? "") }), ...catalogUpdatedAtPatch() },
  );
  return stripProductForRole(await fetchProductWithExpand(pb, updated.id), role);
}

export async function archiveCatalogProductRecord(user: Record<string, unknown>, id: string) {
  if (!canActivateCatalogProduct(user)) {
    throw new Error("Anda tidak punya izin menyimpan produk ke draft.");
  }
  const pb = await getCatalogPb();
  const role = resolveCatalogViewRole(user);
  const existing = await pb.collection(INV_COLLECTIONS.products).getOne<CatalogProduct>(id);
  const status = normalizeLifecycleStatus(existing);
  if (status === "draft") {
    return stripProductForRole(await fetchProductWithExpand(pb, id), role);
  }

  const updated = await pb.collection(INV_COLLECTIONS.products).update(
    id,
    { ...lifecyclePatch("draft"), ...catalogUpdatedAtPatch() },
  );
  return stripProductForRole(await fetchProductWithExpand(pb, updated.id), role);
}
