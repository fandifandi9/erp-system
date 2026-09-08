import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { canAccessCatalog } from "./catalog-access";
import { InventoryApiError } from "@/lib/inventory/api-auth";

export async function requireCatalogAccess(req?: Request) {
  const ctx = await getApiAuthUser(req);
  if (!ctx || !canAccessCatalog(ctx.user)) {
    throw new InventoryApiError("Akses katalog ditolak.", 403);
  }
  return ctx;
}
