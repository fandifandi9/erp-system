import { pb } from "@/lib/pocketbase";
import { createBillPayment } from "./client";
import { BISNIS_COLLECTIONS, type PurchaseBill } from "./types";
import { paymentMethodRelationId } from "./payment-method-value";
import type { PaymentMethodSetting } from "./types";
import { emitBusinessEvent } from "@/lib/tenant/activity-events";
import {
  assertCashAccountBelongsToCompany,
  fetchPurchaseBillCompany,
} from "./entity-resolve";

export type ApplyBillPaymentInput = {
  bill: Pick<
    PurchaseBill,
    "id" | "total" | "paid_amount" | "remaining" | "status" | "company"
  >;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethodSetting;
  /** Akun kas/bank sumber dana — wajib, harus milik entitas bill. */
  cashAccountId: string;
  referenceNo?: string;
  notes?: string;
  createdBy: string;
};

export type ApplyBillPaymentResult = {
  paymentId: string;
  paidAmount: number;
  remaining: number;
  status: PurchaseBill["status"];
};

/** Satu pencatatan pembayaran hutang + update bill (mirror applyInvoicePayment). */
export async function applyBillPayment(
  input: ApplyBillPaymentInput,
): Promise<ApplyBillPaymentResult> {
  const { bill, amount, paymentDate, paymentMethod, createdBy } = input;
  if (amount <= 0) throw new Error("Jumlah pembayaran harus lebih dari 0");
  if (amount - bill.remaining > 0.01) {
    throw new Error("Jumlah pembayaran melebihi sisa hutang");
  }

  const cashAccountId = input.cashAccountId?.trim();
  if (!cashAccountId) {
    throw new Error("Akun kas/bank sumber dana wajib dipilih");
  }

  const companyId = bill.company || (await fetchPurchaseBillCompany(bill.id)) || undefined;
  if (!companyId) {
    throw new Error("Entitas tagihan tidak ditemukan — muat ulang halaman atau hubungi admin");
  }
  await assertCashAccountBelongsToCompany(cashAccountId, companyId);

  const pay = await createBillPayment({
    purchase_bill: bill.id,
    company: companyId,
    payment_date: paymentDate,
    amount,
    payment_method: paymentMethodRelationId(paymentMethod),
    cash_account: cashAccountId,
    reference_no: input.referenceNo?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    created_by: createdBy,
  });

  const newPaid = (bill.paid_amount ?? 0) + amount;
  const newRemaining = Math.max(0, bill.total - newPaid);
  const newStatus: PurchaseBill["status"] =
    newRemaining <= 0 ? "paid" : bill.status === "overdue" ? "overdue" : "unpaid";

  await pb.collection(BISNIS_COLLECTIONS.purchaseBills).update(bill.id, {
    paid_amount: newPaid,
    remaining: newRemaining,
    status: newStatus,
  });

  const billFull = await pb
    .collection(BISNIS_COLLECTIONS.purchaseBills)
    .getOne(bill.id, { fields: "bill_no,company" })
    .catch(() => null);
  void emitBusinessEvent({
    event_code: "purchase.payment.sent",
    module: "purchase",
    entity_type: "biz_purchase_bills",
    entity_id: bill.id,
    entity_label: (billFull as { bill_no?: string } | null)?.bill_no,
    payload: {
      bill_no: (billFull as { bill_no?: string } | null)?.bill_no,
      amount,
      cash_account_id: cashAccountId,
      company_id: companyId,
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
