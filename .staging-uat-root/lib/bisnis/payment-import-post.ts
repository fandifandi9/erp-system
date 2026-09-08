import { pb } from "@/lib/pocketbase";
import { applyInvoicePayment } from "./invoice-payment";
import {
  fetchPaymentImportBatch,
  fetchPaymentImportLines,
  updatePaymentImportBatch,
  updatePaymentImportLine,
} from "./payment-import-client";
import { fetchPaymentMethods } from "./client";
import { findPaymentMethod } from "./payment-method-value";
import { BISNIS_COLLECTIONS, type Invoice } from "./types";

export type PostPaymentImportResult = {
  posted: number;
  skipped: number;
  errors: string[];
};

export async function postPaymentImportBatch(
  batchId: string,
  userId: string,
): Promise<PostPaymentImportResult> {
  const batch = await fetchPaymentImportBatch(batchId);
  if (batch.status === "cancelled") {
    throw new Error("Batch dibatalkan");
  }
  if (batch.status === "posted" && batch.posted_rows >= batch.valid_rows && batch.valid_rows > 0) {
    return { posted: 0, skipped: 0, errors: ["Batch sudah diposting penuh"] };
  }

  const lines = await fetchPaymentImportLines(batchId);
  const validLines = lines
    .filter((l) => l.validation_status === "valid" && l.invoice && !l.payment)
    .sort((a, b) => a.row_no - b.row_no);

  if (validLines.length === 0) {
    throw new Error("Tidak ada baris valid untuk diposting");
  }

  const methods = await fetchPaymentMethods(true);
  let posted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const line of validLines) {
    try {
      const invoice = await pb.collection(BISNIS_COLLECTIONS.invoices).getOne<Invoice>(line.invoice!, {
        requestKey: null,
      });

      if (invoice.status === "cancelled") {
        skipped++;
        await updatePaymentImportLine(line.id, {
          validation_status: "skipped",
          error_message: "Invoice dibatalkan",
        });
        continue;
      }

      const remaining = invoice.remaining ?? Math.max(0, invoice.total - invoice.paid_amount);
      if (remaining <= 0) {
        skipped++;
        await updatePaymentImportLine(line.id, {
          validation_status: "skipped",
          error_message: "Sudah lunas",
        });
        continue;
      }

      let amount = line.amount;
      if (line.lunas_penuh) amount = remaining;
      amount = Math.min(amount, remaining);
      if (amount <= 0) {
        skipped++;
        continue;
      }

      const pm = line.payment_method
        ? findPaymentMethod(methods, line.payment_method)
        : findPaymentMethod(methods, line.payment_method_label ?? "");
      if (!pm) throw new Error("Metode bayar tidak valid");

      const result = await applyInvoicePayment({
        invoice,
        amount,
        paymentDate: line.payment_date,
        paymentMethod: pm,
        referenceNo: line.reference_no,
        notes: line.notes,
        createdBy: userId,
      });

      await updatePaymentImportLine(line.id, {
        validation_status: "posted",
        payment: result.paymentId,
        amount,
      });
      posted++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Baris ${line.row_no}: ${msg}`);
      await updatePaymentImportLine(line.id, {
        validation_status: "error",
        error_message: msg,
      });
    }
  }

  const totalPosted = (batch.posted_rows ?? 0) + posted;
  const target = batch.valid_rows;
  const status =
    totalPosted >= target && target > 0
      ? "posted"
      : totalPosted > 0
        ? "posted"
        : "validated";

  await updatePaymentImportBatch(batchId, {
    status,
    posted_rows: totalPosted,
    posted_at: totalPosted > 0 ? new Date().toISOString().slice(0, 10) : undefined,
  });

  return { posted, skipped, errors };
}
