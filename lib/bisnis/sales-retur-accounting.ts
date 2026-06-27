import type PocketBase from "pocketbase";
import { nextDocNoFor } from "@/lib/bisnis/doc-number";
import {
  createInvoiceRefundPayment,
  deleteRefundPayments,
} from "@/lib/bisnis/invoice-refund-payment";
import { BISNIS_COLLECTIONS, type Invoice, type SalesOrder } from "@/lib/bisnis/types";

function roundMoney(n: number) {
  return Math.round(n);
}

/**
 * Pembukuan retur penjualan — METODE AKRUAL.
 *
 * Prinsip:
 * 1. Transaksi asli (invoice/SO) TIDAK pernah diubah total/subtotal-nya.
 *    Pendapatan bulan lalu tetap utuh di laba-rugi periode aslinya.
 * 2. Retur dicatat sebagai NOTA KREDIT (biz_credit_notes) bertanggal hari ini
 *    → masuk akun "Retur Penjualan" (contra revenue) di periode berjalan.
 * 3. Efek saldo:
 *    - Porsi belum dibayar → mengurangi piutang (invoice.remaining).
 *    - Porsi sudah dibayar → refund tunai (payment_kind=refund, mengurangi kas).
 * Invariant: total = paid_amount + remaining + Σ(applied_to_receivable + refunded).
 */

export type InvoiceRefundSnapshot = {
  invoiceId: string;
  total: number;
  subtotal: number;
  paid_amount: number;
  remaining: number;
  status: Invoice["status"];
  notes?: string;
  expected_net?: number;
};

export type SalesOrderRefundSnapshot = {
  soId: string;
  total: number;
  subtotal: number;
  payment_status: SalesOrder["payment_status"];
  notes?: string;
};

export type RefundApplyResult = {
  invoice?: InvoiceRefundSnapshot;
  salesOrder?: SalesOrderRefundSnapshot;
  expenseIds: string[];
  refundPaymentIds: string[];
  creditNoteIds: string[];
};

async function createReturExpense(
  pb: PocketBase,
  input: {
    category: "transportasi" | "lainnya";
    description: string;
    amount: number;
    referenceNo: string;
    userId: string;
    notes?: string;
    companyId?: string;
    storeId?: string;
    warehouseId?: string;
  },
): Promise<string | null> {
  if (!input.amount || input.amount <= 0) return null;
  const expenseNo = await nextDocNoFor("exp");
  const row = await pb.collection(BISNIS_COLLECTIONS.expenses).create({
    expense_no: expenseNo,
    category: input.category,
    description: input.description,
    amount: input.amount,
    tax_amount: 0,
    total: input.amount,
    expense_date: new Date().toISOString().slice(0, 10),
    status: "approved",
    reference_no: input.referenceNo,
    notes: input.notes,
    created_by: input.userId,
    ...(input.companyId ? { company: input.companyId } : {}),
    ...(input.storeId ? { store: input.storeId } : {}),
    ...(input.warehouseId ? { warehouse: input.warehouseId } : {}),
  });
  return row.id;
}

export async function applySalesReturAccounting(
  pb: PocketBase,
  input: {
    soId: string;
    invoiceId?: string;
    returId?: string;
    refundTotal: number;
    mpClaim: number;
    shippingReimb: number;
    returNo: string;
    orderNo?: string;
    isFullReturn: boolean;
    userId: string;
  },
): Promise<RefundApplyResult> {
  const { soId, refundTotal, mpClaim, shippingReimb, returNo, isFullReturn } = input;
  const result: RefundApplyResult = { expenseIds: [], refundPaymentIds: [], creditNoteIds: [] };

  // Pengurang pendapatan bersih = nilai retur dikurangi kompensasi marketplace.
  const netReduction = Math.max(0, roundMoney(refundTotal - mpClaim));

  if (refundTotal > 0) {
    const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId);
    result.salesOrder = {
      soId,
      total: so.total ?? 0,
      subtotal: so.subtotal ?? 0,
      payment_status: so.payment_status,
      notes: so.notes,
    };
    // Total/subtotal SO TIDAK diubah — hanya status pembayaran & catatan.
    const soPatch: Partial<SalesOrder> = {
      notes: [so.notes, `Retur ${returNo}: -${refundTotal}${mpClaim ? `, kompensasi MP +${mpClaim}` : ""}`]
        .filter(Boolean)
        .join("\n"),
    };
    if (isFullReturn) {
      soPatch.payment_status = "refunded";
    } else if (so.payment_status === "paid") {
      soPatch.payment_status = "partial";
    }
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(soId, soPatch);

    if (input.invoiceId && netReduction > 0) {
      const inv = await pb.collection(BISNIS_COLLECTIONS.invoices).getOne<Invoice>(input.invoiceId);
      result.invoice = {
        invoiceId: inv.id,
        total: inv.total ?? 0,
        subtotal: inv.subtotal ?? 0,
        paid_amount: inv.paid_amount ?? 0,
        remaining: inv.remaining ?? 0,
        status: inv.status,
        notes: inv.notes,
        expected_net: inv.expected_net,
      };

      const paid = Number(inv.paid_amount) || 0;
      const remaining = Number(inv.remaining) || 0;

      // 1) Kurangi piutang dulu (porsi belum dibayar).
      const newRemaining = Math.max(0, roundMoney(remaining - netReduction));
      const appliedToReceivable = roundMoney(remaining - newRemaining);
      // 2) Sisa nota kredit dikembalikan tunai (maksimal sebesar yang sudah dibayar).
      const leftover = netReduction - appliedToReceivable;
      const refundToCustomer = Math.max(0, Math.min(roundMoney(leftover), paid));
      const newPaid = Math.max(0, roundMoney(paid - refundToCustomer));

      // Total & subtotal tetap — pendapatan periode asli tidak berubah.
      const invPatch: Partial<Invoice> = {
        paid_amount: newPaid,
        remaining: newRemaining,
        notes: [inv.notes, `Retur ${returNo}: nota kredit -${netReduction}`]
          .filter(Boolean)
          .join("\n"),
      };
      // Tidak ada lagi yang perlu ditagih → tutup invoice.
      if (newRemaining <= 0 && inv.status !== "cancelled") {
        invPatch.status = "paid";
      }
      if (inv.source === "marketplace_import" && inv.expected_net != null) {
        invPatch.expected_net = Math.max(0, roundMoney(inv.expected_net - refundTotal + mpClaim));
      }

      await pb.collection(BISNIS_COLLECTIONS.invoices).update(inv.id, invPatch);

      // Nota kredit = akun "Retur Penjualan" di laba-rugi periode berjalan.
      const cnNo = await nextDocNoFor("cn");
      const companyId = inv.company || so.company;
      const cn = await pb.collection(BISNIS_COLLECTIONS.creditNotes).create({
        cn_no: cnNo,
        retur: input.returId || undefined,
        invoice: inv.id,
        sales_order: soId,
        cn_date: new Date().toISOString().slice(0, 10),
        amount: netReduction,
        applied_to_receivable: appliedToReceivable,
        refunded: refundToCustomer,
        status: "issued",
        reason: `Retur ${returNo}${input.orderNo ? ` (SO ${input.orderNo})` : ""}`,
        created_by: input.userId,
        ...(companyId ? { company: companyId } : {}),
      });
      result.creditNoteIds.push(cn.id);

      if (refundToCustomer > 0) {
        const refundPay = await createInvoiceRefundPayment(pb, {
          invoice: inv,
          amount: refundToCustomer,
          returNo,
          userId: input.userId,
        });
        if (refundPay) result.refundPaymentIds.push(refundPay.id);
      }
    }
  }

  if (shippingReimb > 0) {
    const so = await pb
      .collection(BISNIS_COLLECTIONS.salesOrders)
      .getOne<SalesOrder>(soId, { fields: "company,store,warehouse", requestKey: null })
      .catch(() => null);
    const expId = await createReturExpense(pb, {
      category: "transportasi",
      description: `Reimburse ongkir retur ${returNo}`,
      amount: shippingReimb,
      referenceNo: returNo,
      userId: input.userId,
      notes: input.orderNo ? `SO ${input.orderNo}` : undefined,
      companyId: so?.company,
      storeId: so?.store,
      warehouseId: so?.warehouse,
    });
    if (expId) result.expenseIds.push(expId);
  }

  return result;
}

export async function revertSalesReturAccounting(
  pb: PocketBase,
  snapshot: RefundApplyResult,
): Promise<void> {
  if (snapshot.salesOrder) {
    const s = snapshot.salesOrder;
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(s.soId, {
      payment_status: s.payment_status,
      notes: s.notes ?? "",
    });
  }
  if (snapshot.invoice) {
    const i = snapshot.invoice;
    await pb.collection(BISNIS_COLLECTIONS.invoices).update(i.invoiceId, {
      paid_amount: i.paid_amount,
      remaining: i.remaining,
      status: i.status,
      notes: i.notes ?? "",
      ...(i.expected_net != null ? { expected_net: i.expected_net } : {}),
    });
  }
  for (const cnId of snapshot.creditNoteIds ?? []) {
    try {
      await pb.collection(BISNIS_COLLECTIONS.creditNotes).update(cnId, { status: "cancelled" });
    } catch {
      /* ignore */
    }
  }
  for (const expId of snapshot.expenseIds) {
    try {
      await pb.collection(BISNIS_COLLECTIONS.expenses).update(expId, { status: "cancelled" });
    } catch {
      /* ignore */
    }
  }
  if (snapshot.refundPaymentIds?.length) {
    await deleteRefundPayments(pb, snapshot.refundPaymentIds);
  }
}
