import { normalizeAuthModel } from "@/lib/rbac";

type UserShape = Record<string, unknown> | null | undefined;

export function readInventoryRole(user: UserShape): string {
  if (!user) return "none";
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return "admin";
  const raw = (user.inventory_role ?? "none").toString().toLowerCase().trim();
  if (raw === "staff" || raw === "supervisor" || raw === "admin") return raw;
  return "none";
}

export function canAccessInventory(user: UserShape): boolean {
  if (!user) return false;
  const auth = normalizeAuthModel(user);
  return readInventoryRole(user) !== "none" || auth.accountType === "owner";
}
