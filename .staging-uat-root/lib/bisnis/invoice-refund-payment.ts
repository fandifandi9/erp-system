import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type Invoice } from "@/lib/bisnis/types";

export type RefundPaymentRecord = {
  id: string;
  amount: number;
  invoiceId: string;
};

/** Catat refund di riwayat pembayaran (payment_kind = refund). */
export async function createInvoiceRefundPayment(
  pb: PocketBase,
  input: {
    invoice: Pick<Invoice, "id">;
    amount: number;
    returNo: string;
    userId: string;
    paymentMethodId?: string;
  },
): Promise<RefundPaymentRecord | null> {
  const amount = Math.round(input.amount);
  if (amount <= 0) return null;

  let methodId = input.paymentMethodId?.trim() || "";
  if (!methodId) {
    try {
      const methods = await pb.collection(BISNIS_COLLECTIONS.paymentMethods).getList(1, 1, {
        filter: 'is_active = true',
        sort: "code",
      });
      methodId = String(methods.items[0]?.id ?? "");
    } catch {
      methodId = "";
    }
  }

  const base = {
    invoice: input.invoice.id,
    payment_date: new Date().toISOString().slice(0, 10),
    amount,
    payment_method: methodId || undefined,
    reference_no: input.returNo,
    notes: `[REFUND] Retur ${input.returNo}`,
    created_by: input.userId,
  };
  const invRow = await pb
    .collection(BISNIS_COLLECTIONS.invoices)
    .getOne(input.invoice.id, { fields: "company", requestKey: null })
    .catch(() => null);
  const company = (invRow as { company?: string } | null)?.company;
  let row;
  try {
    row = await pb.collection(BISNIS_COLLECTIONS.payments).create({
      ...base,
      payment_kind: "refund",
      ...(company ? { company } : {}),
    });
  } catch {
    row = await pb.collection(BISNIS_COLLECTIONS.payments).create({
      ...base,
      ...(company ? { company } : {}),
    });
  }

  return { id: row.id, amount, invoiceId: input.invoice.id };
}

export async function deleteRefundPayments(pb: PocketBase, paymentIds: string[]): Promise<void> {
  for (const id of paymentIds) {
    try {
      await pb.collection(BISNIS_COLLECTIONS.payments).delete(id);
    } catch {
      /* ignore */
    }
  }
}
