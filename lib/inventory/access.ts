import { normalizeAuthModel } from "@/lib/rbac";
import type { InventoryRole } from "@/lib/inventory/types";

type UserShape = Record<string, unknown> | null | undefined;

export function readInventoryRole(user: UserShape): InventoryRole {
  if (!user) return "none";
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return "admin";
  const raw = (user.inventory_role ?? "none").toString().toLowerCase().trim();
  if (raw === "staff" || raw === "supervisor" || raw === "admin") return raw;
  return "none";
}

export function canAccessInventory(user: UserShape): boolean {
  return readInventoryRole(user) !== "none" || normalizeAuthModel(user).accountType === "owner";
}

export function isInventoryAdmin(user: UserShape): boolean {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  return readInventoryRole(user) === "admin";
}

export function canManageInventoryMaster(user: UserShape): boolean {
  return isInventoryAdmin(user);
}

export function canPostInventoryMovement(user: UserShape): boolean {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  const role = readInventoryRole(user);
  return role === "admin" || role === "supervisor";
}

export function canCreateInventoryDraft(user: UserShape): boolean {
  return canAccessInventory(user);
}

/** Supervisor+ melihat semua aktivitas staff di gudang. */
export function canViewAllStaffActivities(user: UserShape): boolean {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  const role = readInventoryRole(user);
  return role === "admin" || role === "supervisor";
}

export const INVENTORY_WEB_PATHS = [
  "/inventory",
  "/inventory/products",
  "/inventory/warehouses",
  "/inventory/stock",
  "/inventory/movements",
  "/inventory/zones",
  "/inventory/zones/checkin",
  "/inventory/activities",
] as const;
