import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Store } from "@/lib/bisnis/types";

export async function loadStoreByWarehouse(
  warehouseId?: string,
): Promise<Pick<Store, "name" | "phone" | "email" | "address"> | null> {
  if (!warehouseId) return null;
  const pb = await getInventoryAdminPb();
  const whEsc = String(warehouseId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const stores = await pb.collection(BISNIS_COLLECTIONS.stores).getFullList<Store>({
    filter: `default_warehouse = "${whEsc}" && is_active = true`,
    fields: "name,phone,email,address",
  });
  return stores[0] ?? null;
}
