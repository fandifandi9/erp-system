import { pb } from "@/lib/pocketbase";
import { createPayment } from "./client";
import { BISNIS_COLLECTIONS, type Invoice } from "./types";
import { paymentMethodRelationId } from "./payment-method-value";
import type { PaymentMethodSetting } from "./types";
import { emitBusinessEvent } from "@/lib/tenant/activity-events";

export type ApplyInvoicePaymentInput = {
  invoice: Pick<Invoice, "id" | "total" | "paid_amount" | "remaining" | "status" | "sales_order">;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethodSetting;
  /** Akun kas/bank tujuan dana — menambah saldo akun di Kas & Bank. */
  cashAccountId?: string;
  /**
   * Fee/denda tambahan yang dibayar pelanggan saat pelunasan.
   * Tidak mengurangi piutang — dicatat sebagai Pendapatan Lain-lain
   * di laba-rugi periode berjalan (tanggal bayar), metode akrual.
   */
  feeAmount?: number;
  referenceNo?: string;
  notes?: string;
  createdBy: string;
};

export type ApplyInvoicePaymentResult = {
  paymentId: string;
  paidAmount: number;
  remaining: number;
  status: Invoice["status"];
};

/** Satu pencatatan pelunasan + update invoice (sama dengan form Terima Pembayaran). */
export async function applyInvoicePayment(
  input: ApplyInvoicePaymentInput,
): Promise<ApplyInvoicePaymentResult> {
  const { invoice, amount, paymentDate, paymentMethod, createdBy } = input;
  if (amount <= 0) throw new Error("Jumlah pembayaran harus lebih dari 0");

  const fee = Math.max(0, Math.round(Number(input.feeAmount) || 0));

  const pay = await createPayment({
    invoice: invoice.id,
    payment_date: paymentDate,
    amount,
    fee_amount: fee || undefined,
    payment_method: paymentMethodRelationId(paymentMethod),
    cash_account: input.cashAccountId || undefined,
    reference_no: input.referenceNo?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    created_by: createdBy,
  });

  const newPaid = invoice.paid_amount + amount;
  const newRemaining = Math.max(0, invoice.total - newPaid);
  const newStatus: Invoice["status"] =
    newRemaining <= 0 ? "paid" : invoice.status === "overdue" ? "overdue" : "unpaid";

  await pb.collection(BISNIS_COLLECTIONS.invoices).update(invoice.id, {
    paid_amount: newPaid,
    remaining: newRemaining,
    status: newStatus,
  });

  // Sinkronkan status bayar SO agar filter "belum dibayar" berbasis SO tidak basi.
  if (invoice.sales_order) {
    await pb
      .collection(BISNIS_COLLECTIONS.salesOrders)
      .update(invoice.sales_order, {
        payment_status: newRemaining <= 0 ? "paid" : "partial",
      })
      .catch(() => {
        /* non-fatal */
      });
  }

  const invFull = await pb.collection(BISNIS_COLLECTIONS.invoices).getOne(invoice.id, {
    fields: "invoice_no,store",
  });
  void emitBusinessEvent({
    event_code: "sales.payment.received",
    module: "sales",
    entity_type: "biz_invoices",
    entity_id: invoice.id,
    entity_label: (invFull as { invoice_no?: string }).invoice_no,
    store_id: (invFull as { store?: string }).store,
    payload: {
      invoice_no: (invFull as { invoice_no?: string }).invoice_no,
      amount,
    },
    actor_id: createdBy,
  });

  return {
    paymentId: pay.id,
    paidAmount: newPaid,
    remaining: newRemaining,
    status: newStatus,
  };
}
