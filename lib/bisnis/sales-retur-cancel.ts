import type PocketBase from "pocketbase";
import type { RefundApplyResult } from "@/lib/bisnis/sales-retur-accounting";
import { deleteRefundPayments } from "@/lib/bisnis/invoice-refund-payment";
import { voidReturnStockMovements } from "@/lib/inventory/retur-stock-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import {
  BISNIS_COLLECTIONS,
  type CreditNote,
  type Invoice,
  type Retur,
  type SalesOrder,
} from "@/lib/bisnis/types";

/** Batalkan retur yang sudah selesai — void stok + balik pembukuan. */
export async function cancelCompletedSalesRetur(
  pb: PocketBase,
  returId: string,
  userId: string,
  reason?: string,
): Promise<Retur> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.type !== "penjualan") {
    throw new Error("Hanya retur penjualan yang didukung.");
  }
  if (retur.status !== "completed") {
    throw new Error("Hanya retur selesai yang bisa dibatalkan.");
  }

  const soId = retur.sales_order || retur.reference_id;
  if (!soId) {
    throw new Error("Retur tidak terhubung ke sales order.");
  }

  const refundTotal = Number(retur.total) || 0;
  const mpClaim = Math.max(0, Number(retur.mp_claim_amount) || 0);
  const shippingReimb = Math.max(0, Number(retur.shipping_reimb_amount) || 0);

  const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId);
  let refundPayments: { id: string }[] = [];
  try {
    refundPayments = await pb.collection(BISNIS_COLLECTIONS.payments).getFullList({
      filter: `reference_no = "${retur.retur_no}" && payment_kind = "refund"`,
      requestKey: null,
    });
  } catch {
    refundPayments = await pb.collection(BISNIS_COLLECTIONS.payments).getFullList({
      filter: `reference_no = "${retur.retur_no}" && notes ~ "[REFUND]"`,
      requestKey: null,
    });
  }

  // Nota kredit retur ini (model akrual). Kosong = retur lama (model mutasi total).
  let creditNotes: CreditNote[] = [];
  try {
    creditNotes = await pb.collection(BISNIS_COLLECTIONS.creditNotes).getFullList<CreditNote>({
      filter: `retur = "${returId}" && status = "issued"`,
      requestKey: null,
    });
  } catch {
    creditNotes = [];
  }

  const snapshot: RefundApplyResult = {
    expenseIds: [],
    refundPaymentIds: refundPayments.map((p) => p.id),
    creditNoteIds: creditNotes.map((c) => c.id),
    salesOrder: {
      soId,
      total: so.total ?? 0,
      subtotal: so.subtotal ?? 0,
      payment_status: so.payment_status,
      notes: so.notes,
    },
  };

  if (retur.invoice) {
    const inv = await pb.collection(BISNIS_COLLECTIONS.invoices).getOne<Invoice>(retur.invoice);
    snapshot.invoice = {
      invoiceId: inv.id,
      total: inv.total ?? 0,
      subtotal: inv.subtotal ?? 0,
      paid_amount: inv.paid_amount ?? 0,
      remaining: inv.remaining ?? 0,
      status: inv.status,
      notes: inv.notes,
      expected_net: inv.expected_net,
    };
  }

  const expenses = await pb.collection(BISNIS_COLLECTIONS.expenses).getFullList({
    filter: `reference_no = "${retur.retur_no}" && status != "cancelled"`,
    requestKey: null,
  });
  snapshot.expenseIds = expenses.map((e) => e.id);

  const voided = await voidReturnStockMovements(
    pb,
    returId,
    userId,
    reason?.trim() || `Batalkan retur ${retur.retur_no}`,
  );
  if (voided === 0) {
    throw new Error("Mutasi stok retur tidak ditemukan — batalkan manual di gudang.");
  }

  if (creditNotes.length > 0) {
    // ── Model akrual (nota kredit): total asli tidak pernah berubah,
    //    cukup balikkan saldo piutang/paid & batalkan nota kreditnya. ──
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(soId, {
      notes: [so.notes, `Batalkan retur ${retur.retur_no}`].filter(Boolean).join("\n"),
      payment_status: so.payment_status === "refunded" ? "paid" : so.payment_status,
    });

    if (retur.invoice && snapshot.invoice) {
      const inv = snapshot.invoice;
      const applied = creditNotes.reduce((s, c) => s + (Number(c.applied_to_receivable) || 0), 0);
      const refunded = creditNotes.reduce((s, c) => s + (Number(c.refunded) || 0), 0);
      const restoredPaid = Math.round(inv.paid_amount + refunded);
      const restoredRemaining = Math.round(inv.remaining + applied);
      const invPatch: Partial<Invoice> = {
        paid_amount: restoredPaid,
        remaining: restoredRemaining,
        status: restoredRemaining <= 0 && restoredPaid > 0 ? "paid" : "unpaid",
        notes: [inv.notes, `Batalkan retur ${retur.retur_no}`].filter(Boolean).join("\n"),
      };
      if (inv.expected_net != null) {
        invPatch.expected_net = Math.round(inv.expected_net + refundTotal - mpClaim);
      }
      await pb.collection(BISNIS_COLLECTIONS.invoices).update(inv.invoiceId, invPatch);
    }

    for (const cn of creditNotes) {
      await pb.collection(BISNIS_COLLECTIONS.creditNotes).update(cn.id, {
        status: "cancelled",
        notes: [cn.notes, `Dibatalkan bersama retur ${retur.retur_no}`].filter(Boolean).join("\n"),
      });
    }
  } else {
    // ── Model lama (retur sebelum nota kredit): total ikut dimutasi, jadi dikembalikan. ──
    const restoredSoTotal = Math.round((so.total ?? 0) + refundTotal - mpClaim);
    const restoredSoSubtotal = Math.round((so.subtotal ?? 0) + refundTotal);
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(soId, {
      total: restoredSoTotal,
      subtotal: restoredSoSubtotal,
      notes: [so.notes, `Batalkan retur ${retur.retur_no}`].filter(Boolean).join("\n"),
      payment_status: so.payment_status === "refunded" ? "paid" : so.payment_status,
    });

    if (retur.invoice && snapshot.invoice) {
      const inv = snapshot.invoice;
      const restoredInvTotal = Math.round(inv.total + refundTotal - mpClaim);
      const restoredInvSubtotal = Math.round(inv.subtotal + refundTotal);
      const restoredPaid = Math.round(inv.paid_amount + refundTotal);
      const restoredRemaining = Math.max(0, restoredInvTotal - restoredPaid);
      const invPatch: Partial<Invoice> = {
        total: restoredInvTotal,
        subtotal: restoredInvSubtotal,
        paid_amount: restoredPaid,
        remaining: restoredRemaining,
        status: restoredRemaining <= 0 && restoredPaid > 0 ? "paid" : "unpaid",
        notes: [inv.notes, `Batalkan retur ${retur.retur_no}`].filter(Boolean).join("\n"),
      };
      if (inv.expected_net != null) {
        invPatch.expected_net = Math.round(inv.expected_net + refundTotal - mpClaim);
      }
      await pb.collection(BISNIS_COLLECTIONS.invoices).update(inv.invoiceId, invPatch);
    }
  }

  for (const expId of snapshot.expenseIds) {
    await pb.collection(BISNIS_COLLECTIONS.expenses).update(expId, { status: "cancelled" });
  }

  if (snapshot.refundPaymentIds.length) {
    await deleteRefundPayments(pb, snapshot.refundPaymentIds);
  }

  return pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
    wms_receive_status: "complete",
    status: "cancelled",
    notes: [retur.notes, reason?.trim() ? `Dibatalkan: ${reason.trim()}` : "Dibatalkan"]
      .filter(Boolean)
      .join("\n"),
  });
}

/** Batalkan retur draf/approved — void stok transit bila sudah diterima WMS. */
export async function cancelDraftSalesRetur(
  pb: PocketBase,
  returId: string,
  reason?: string,
  userId?: string,
): Promise<Retur> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.status !== "draft" && retur.status !== "approved") {
    throw new Error("Hanya retur draf yang bisa dibatalkan dari sini.");
  }
  if (retur.workflow_phase === "resend" || retur.business_resolution === "resend") {
    throw new Error(
      "Retur sudah di antrean kirim kembali WMS. Selesaikan serah terima di Pickup, atau hubungi gudang.",
    );
  }

  const note = reason?.trim() || `Batalkan retur ${retur.retur_no}`;
  if (retur.wms_receive_status === "complete" && userId) {
    await voidReturnStockMovements(pb, returId, userId, note);
  }

  try {
    const tasks = await pb.collection(INV_COLLECTIONS.staffActivities).getFullList({
      filter: `entity_type = "biz_returs" && entity_id = "${returId}" && (activity_type = "wms.sales_return_receive" || activity_type = "wms.sales_return_resend")`,
      requestKey: null,
    });
    for (const row of tasks) {
      const r = row as { id: string; payload?: Record<string, unknown> };
      if (r.payload?.status === "complete" || r.payload?.status === "cancelled") continue;
      try {
        await pb.collection(INV_COLLECTIONS.staffActivities).update(r.id, {
          payload: { ...(r.payload ?? {}), status: "cancelled", cancel_reason: note },
        });
      } catch {
        /* best effort */
      }
    }
  } catch {
    /* collection opsional */
  }

  return pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
    status: "cancelled",
    workflow_phase: "cancelled",
    exception_status: retur.exception_status === "open" ? "resolved" : retur.exception_status,
    reminder_due_at: "",
    notes: [retur.notes, reason?.trim() ? `Dibatalkan: ${reason.trim()}` : "Dibatalkan"]
      .filter(Boolean)
      .join("\n"),
  });
}
