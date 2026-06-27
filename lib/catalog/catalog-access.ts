import { normalizeAuthModel } from "@/lib/auth-model";
import {
  canAccessInventory,
  isInventoryAdmin,
  isInventorySupervisorOrAbove,
  isWarehouseStaffOnly,
  readInventoryRole,
} from "@/lib/inventory/access";
import type { CatalogViewRole } from "./types";

type UserShape = Record<string, unknown> | null | undefined;

export function canAccessCatalog(user: UserShape): boolean {
  if (!user) return false;
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  return canAccessInventory(user);
}

export function resolveCatalogViewRole(user: UserShape): CatalogViewRole {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return "owner";
  if (isInventoryAdmin(user)) return "commercial";
  if (isInventorySupervisorOrAbove(user)) return "commercial";
  if (isWarehouseStaffOnly(user)) return "warehouse";
  const invRole = readInventoryRole(user);
  if (invRole === "staff") return "warehouse";
  if (invRole === "supervisor" || invRole === "admin") return "commercial";
  return "warehouse";
}

export function canCreateCatalogProduct(user: UserShape): boolean {
  return canAccessCatalog(user);
}

export function canActivateCatalogProduct(user: UserShape): boolean {
  const role = resolveCatalogViewRole(user);
  return role === "owner" || role === "commercial";
}

export function canEditCatalogPrices(user: UserShape): boolean {
  const role = resolveCatalogViewRole(user);
  return role === "owner" || role === "commercial" || role === "finance";
}

export function canEditCatalogIdentity(user: UserShape): boolean {
  return canAccessCatalog(user);
}

export function canEditCatalogLogistics(user: UserShape): boolean {
  const role = resolveCatalogViewRole(user);
  return role === "owner" || role === "commercial" || role === "warehouse";
}

export function defaultLifecycleOnCreate(user: UserShape): "draft" | "active" {
  return canActivateCatalogProduct(user) ? "active" : "draft";
}

export function createdByRoleSnapshot(user: UserShape): string {
  const role = resolveCatalogViewRole(user);
  if (role === "warehouse") return "warehouse";
  if (role === "commercial" || role === "owner") return "admin";
  return role;
}

export const CATALOG_WEB_PATHS = [
  "/katalog",
  "/katalog/produk",
  "/katalog/bundling",
  "/katalog/harga",
  "/katalog/mapping",
  "/katalog/akun-mp",
  "/katalog/kategori",
  "/katalog/brand",
  "/inventory/categories",
  "/inventory/brands",
  "/wms/barcode",
] as const;
