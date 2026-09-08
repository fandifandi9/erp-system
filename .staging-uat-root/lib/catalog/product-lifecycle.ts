import type { CatalogProduct, ProductLifecycleStatus } from "./types";

export const PRODUCT_LIFECYCLE_UI: Record<
  ProductLifecycleStatus,
  { label: string; tone: "slate" | "emerald" | "amber" }
> = {
  draft: { label: "Draft", tone: "amber" },
  active: { label: "Aktif", tone: "emerald" },
  inactive: { label: "Nonaktif", tone: "slate" },
};

export function normalizeLifecycleStatus(
  product: Pick<CatalogProduct, "lifecycle_status" | "is_active">,
): ProductLifecycleStatus {
  const raw = product.lifecycle_status?.trim();
  if (raw === "draft" || raw === "active" || raw === "inactive") return raw;
  return product.is_active === false ? "inactive" : "active";
}

export function syncIsActiveFromLifecycle(status: ProductLifecycleStatus): boolean {
  return status === "active";
}

export function lifecyclePatch(
  status: ProductLifecycleStatus,
  opts?: { userId?: string; now?: string },
): Record<string, unknown> {
  const now = opts?.now ?? new Date().toISOString();
  const patch: Record<string, unknown> = {
    lifecycle_status: status,
    is_active: syncIsActiveFromLifecycle(status),
  };
  if (status === "active") {
    patch.commercial_ready_at = now;
    if (opts?.userId) patch.commercial_ready_by = opts.userId;
  }
  return patch;
}

export function sellableProductsPbFilter(): string {
  return 'lifecycle_status = "active"';
}

/** Kompatibilitas jika field lifecycle belum dimigrasi. */
export function sellableProductsPbFilterFallback(): string {
  return "is_active = true";
}
