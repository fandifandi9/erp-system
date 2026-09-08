import type PocketBase from "pocketbase";
import { cancelCompletedPurchaseRetur } from "@/lib/bisnis/purchase-retur-cancel";
import {
  cancelCompletedSalesRetur,
  cancelDraftSalesRetur,
} from "@/lib/bisnis/sales-retur-cancel";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";

export async function cancelRetur(
  pb: PocketBase,
  returId: string,
  userId: string,
  reason?: string,
): Promise<Retur> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);

  if (retur.status === "draft" || retur.status === "approved") {
    if (retur.type === "pembelian") {
      return pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
        status: "cancelled",
        notes: [retur.notes, reason?.trim() ? `Dibatalkan: ${reason.trim()}` : "Dibatalkan"]
          .filter(Boolean)
          .join("\n"),
      });
    }
    return cancelDraftSalesRetur(pb, returId, reason, userId);
  }

  if (retur.status === "completed") {
    if (retur.type === "pembelian") {
      return cancelCompletedPurchaseRetur(pb, returId, userId, reason);
    }
    return cancelCompletedSalesRetur(pb, returId, userId, reason);
  }

  throw new Error("Retur tidak bisa dibatalkan.");
}
