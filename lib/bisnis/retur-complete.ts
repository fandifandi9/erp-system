import type PocketBase from "pocketbase";
import { completePurchaseRetur } from "@/lib/bisnis/purchase-retur-complete";
import { completeSalesRetur } from "@/lib/bisnis/sales-retur-complete";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";

export async function completeRetur(pb: PocketBase, returId: string, userId: string) {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.type === "pembelian") {
    return completePurchaseRetur(pb, returId, userId);
  }
  return completeSalesRetur(pb, returId, userId);
}
