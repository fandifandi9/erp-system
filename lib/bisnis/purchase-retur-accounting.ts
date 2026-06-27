import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type PurchaseBill, type PurchaseOrder } from "@/lib/bisnis/types";

function roundMoney(n: number) {
  return Math.round(n);
}

export type BillRefundSnapshot = {
  billId: string;
  total: number;
  subtotal: number;
  paid_amount: number;
  remaining: number;
  status: PurchaseBill["status"];
  notes?: string;
};

export type PurchaseRefundApplyResult = {
  purchaseOrder?: {
    poId: string;
    total: number;
    subtotal: number;
    notes?: string;
  };
  bill?: BillRefundSnapshot;
};

export async function applyPurchaseReturAccounting(
  pb: PocketBase,
  input: {
    poId: string;
    billId?: string;
    refundTotal: number;
    returNo: string;
    isFullReturn: boolean;
  },
): Promise<PurchaseRefundApplyResult> {
  const result: PurchaseRefundApplyResult = {};
  const refundTotal = input.refundTotal;
  if (refundTotal <= 0) return result;

  const po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(input.poId);
  result.purchaseOrder = {
    poId: input.poId,
    total: po.total ?? 0,
    subtotal: po.subtotal ?? 0,
    notes: po.notes,
  };
  await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update(input.poId, {
    total: Math.max(0, roundMoney((po.total ?? 0) - refundTotal)),
    subtotal: Math.max(0, roundMoney((po.subtotal ?? 0) - refundTotal)),
    notes: [po.notes, `Retur ${input.returNo}: -${refundTotal}`].filter(Boolean).join("\n"),
    ...(input.isFullReturn ? { status: "sent" as const } : {}),
  });

  if (input.billId) {
    const bill = await pb.collection(BISNIS_COLLECTIONS.purchaseBills).getOne<PurchaseBill>(input.billId);
    result.bill = {
      billId: bill.id,
      total: bill.total ?? 0,
      subtotal: bill.subtotal ?? 0,
      paid_amount: bill.paid_amount ?? 0,
      remaining: bill.remaining ?? 0,
      status: bill.status,
      notes: bill.notes,
    };
    const newTotal = Math.max(0, roundMoney((bill.total ?? 0) - refundTotal));
    const paid = Number(bill.paid_amount) || 0;
    const newPaid = paid > 0 ? Math.max(0, Math.min(newTotal, paid - refundTotal)) : paid;
    const newRemaining = Math.max(0, newTotal - newPaid);
    let status = bill.status;
    if (newTotal <= 0) status = "cancelled";
    else if (newRemaining <= 0 && newPaid > 0) status = "paid";
    else if (newPaid > 0 && newRemaining > 0) status = "unpaid";

    await pb.collection(BISNIS_COLLECTIONS.purchaseBills).update(bill.id, {
      total: newTotal,
      subtotal: Math.max(0, roundMoney((bill.subtotal ?? 0) - refundTotal)),
      paid_amount: newPaid,
      remaining: newRemaining,
      status,
      notes: [bill.notes, `Retur ${input.returNo}: -${refundTotal}`].filter(Boolean).join("\n"),
    });
  }

  return result;
}

export async function revertPurchaseReturAccounting(
  pb: PocketBase,
  snapshot: PurchaseRefundApplyResult,
): Promise<void> {
  if (snapshot.purchaseOrder) {
    const p = snapshot.purchaseOrder;
    await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update(p.poId, {
      total: p.total,
      subtotal: p.subtotal,
      notes: p.notes ?? "",
    });
  }
  if (snapshot.bill) {
    const b = snapshot.bill;
    await pb.collection(BISNIS_COLLECTIONS.purchaseBills).update(b.billId, {
      total: b.total,
      subtotal: b.subtotal,
      paid_amount: b.paid_amount,
      remaining: b.remaining,
      status: b.status,
      notes: b.notes ?? "",
    });
  }
}
