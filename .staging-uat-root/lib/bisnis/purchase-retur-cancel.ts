import type PocketBase from "pocketbase";
import { voidReturnStockMovements } from "@/lib/inventory/retur-stock-server";
import { BISNIS_COLLECTIONS, type PurchaseBill, type PurchaseOrder, type Retur } from "@/lib/bisnis/types";

export async function cancelCompletedPurchaseRetur(
  pb: PocketBase,
  returId: string,
  userId: string,
  reason?: string,
): Promise<Retur> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.type !== "pembelian" || retur.status !== "completed") {
    throw new Error("Hanya retur pembelian selesai yang bisa dibatalkan.");
  }

  const poId = retur.purchase_order || retur.reference_id;
  if (!poId) throw new Error("Retur tidak terhubung ke PO.");

  const refundTotal = Number(retur.total) || 0;
  const po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(poId);

  const voided = await voidReturnStockMovements(pb, returId, userId, `Batalkan retur ${retur.retur_no}`);
  if (voided === 0) throw new Error("Mutasi stok retur tidak ditemukan.");

  await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update(poId, {
    total: Math.round((po.total ?? 0) + refundTotal),
    subtotal: Math.round((po.subtotal ?? 0) + refundTotal),
    notes: [po.notes, `Batalkan retur ${retur.retur_no}`].filter(Boolean).join("\n"),
  });

  if (retur.purchase_bill) {
    const bill = await pb.collection(BISNIS_COLLECTIONS.purchaseBills).getOne<PurchaseBill>(retur.purchase_bill);
    const restoredTotal = Math.round((bill.total ?? 0) + refundTotal);
    const restoredPaid = Math.round((bill.paid_amount ?? 0) + refundTotal);
    await pb.collection(BISNIS_COLLECTIONS.purchaseBills).update(bill.id, {
      total: restoredTotal,
      subtotal: Math.round((bill.subtotal ?? 0) + refundTotal),
      paid_amount: restoredPaid,
      remaining: Math.max(0, restoredTotal - restoredPaid),
      notes: [bill.notes, `Batalkan retur ${retur.retur_no}`].filter(Boolean).join("\n"),
    });
  }

  return pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
    status: "cancelled",
    notes: [retur.notes, reason?.trim() ? `Dibatalkan: ${reason.trim()}` : "Dibatalkan"]
      .filter(Boolean)
      .join("\n"),
  });
}
