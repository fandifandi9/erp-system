import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { BISNIS_COLLECTIONS, type Retur } from "./types";

async function companyIdFromWarehouse(pb: PocketBase, warehouseId: string): Promise<string> {
  try {
    const wh = await pb.collection(INV_COLLECTIONS.warehouses).getOne<{
      company?: string;
      store?: string;
    }>(warehouseId, { fields: "company,store", requestKey: null });

    if (wh.company?.trim()) return wh.company.trim();

    if (wh.store) {
      const store = await pb.collection("biz_stores").getOne<{ company?: string }>(wh.store, {
        fields: "company",
        requestKey: null,
      });
      if (store.company?.trim()) return store.company.trim();
    }
  } catch {
    /* abaikan */
  }
  return "";
}

/** Entitas pemilik retur penjualan — dari retur, SO, gudang, atau toko. */
export async function resolveSalesReturCompanyId(
  pb: PocketBase,
  retur: Pick<Retur, "warehouse" | "sales_order" | "reference_id"> & { company?: string },
  soId?: string,
): Promise<string> {
  if (retur.company?.trim()) return retur.company.trim();

  const orderId = soId ?? retur.sales_order ?? retur.reference_id ?? "";
  if (orderId) {
    try {
      const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<{
        company?: string;
        warehouse?: string;
        store?: string;
      }>(orderId, { fields: "company,warehouse,store", requestKey: null });

      if (so.company?.trim()) return so.company.trim();

      if (so.warehouse) {
        const fromWh = await companyIdFromWarehouse(pb, so.warehouse);
        if (fromWh) return fromWh;
      }

      if (so.store) {
        const store = await pb.collection("biz_stores").getOne<{ company?: string }>(so.store, {
          fields: "company",
          requestKey: null,
        });
        if (store.company?.trim()) return store.company.trim();
      }
    } catch {
      /* abaikan */
    }
  }

  if (retur.warehouse) {
    const fromWh = await companyIdFromWarehouse(pb, retur.warehouse);
    if (fromWh) return fromWh;
  }

  return "";
}

export async function warehouseCompanyId(pb: PocketBase, warehouseId: string): Promise<string> {
  return companyIdFromWarehouse(pb, warehouseId);
}
