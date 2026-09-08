import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type Invoice, type PaymentImportBatch, type PaymentImportLine } from "./types";
import { nextDocNo, BIZ_DOC_NUMBER_CONFIG } from "./doc-number";
import { fetchPaymentMethods } from "./client";
import { findPaymentMethod } from "./payment-method-value";
import type { ParsedPaymentImportRow } from "./payment-import-parse";

function escapeFilter(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function findInvoiceByNo(invoiceNo: string): Promise<Invoice | null> {
  const key = invoiceNo.trim();
  if (!key) return null;
  const list = await pb.collection(BISNIS_COLLECTIONS.invoices).getList<Invoice>(1, 1, {
    filter: `invoice_no = "${escapeFilter(key)}"`,
    requestKey: null,
  });
  return list.items[0] ?? null;
}

export async function fetchPaymentImportBatches(opts?: { page?: number; perPage?: number }) {
  return pb.collection(BISNIS_COLLECTIONS.paymentImportBatches).getList<PaymentImportBatch>(
    opts?.page ?? 1,
    opts?.perPage ?? 20,
    { sort: "-created", requestKey: null },
  );
}

export async function fetchPaymentImportBatch(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.paymentImportBatches).getOne<PaymentImportBatch>(id, {
    requestKey: null,
  });
}

export async function createPaymentImportBatch(data: Partial<PaymentImportBatch>) {
  return pb.collection(BISNIS_COLLECTIONS.paymentImportBatches).create<PaymentImportBatch>(data);
}

export async function updatePaymentImportBatch(id: string, data: Partial<PaymentImportBatch>) {
  return pb.collection(BISNIS_COLLECTIONS.paymentImportBatches).update<PaymentImportBatch>(id, data);
}

export async function fetchPaymentImportLines(batchId: string) {
  return pb.collection(BISNIS_COLLECTIONS.paymentImportLines).getFullList<PaymentImportLine>({
    filter: `batch = "${batchId}"`,
    sort: "row_no",
    expand: "invoice,invoice.customer,payment",
    requestKey: null,
  });
}

export async function createPaymentImportLine(data: Partial<PaymentImportLine>) {
  return pb.collection(BISNIS_COLLECTIONS.paymentImportLines).create<PaymentImportLine>(data);
}

export async function updatePaymentImportLine(id: string, data: Partial<PaymentImportLine>) {
  return pb.collection(BISNIS_COLLECTIONS.paymentImportLines).update<PaymentImportLine>(id, data);
}

/** Validasi baris Excel → staging lines. */
export async function processPaymentImportRows(
  batchId: string,
  rows: ParsedPaymentImportRow[],
): Promise<{ valid: number; errors: number }> {
  const methods = await fetchPaymentMethods(true);
  const invoiceCache = new Map<string, Invoice | null>();
  const reservedInBatch = new Map<string, number>();

  let valid = 0;
  let errors = 0;

  const sorted = [...rows].sort((a, b) => a.rowNo - b.rowNo);

  for (const row of sorted) {
    const errorsList: string[] = [];
    let invoice: Invoice | null = null;
    let amount = row.amount;
    let paymentMethodId: string | undefined;
    let status: PaymentImportLine["validation_status"] = "pending";

    const invKey = row.invoice_no.trim().toUpperCase();
    if (!invoiceCache.has(invKey)) {
      invoiceCache.set(invKey, await findInvoiceByNo(row.invoice_no));
    }
    invoice = invoiceCache.get(invKey) ?? null;

    if (!invoice) {
      errorsList.push(`Invoice "${row.invoice_no}" tidak ditemukan`);
    } else if (invoice.status === "cancelled") {
      errorsList.push("Invoice dibatalkan");
    } else {
      const reserved = reservedInBatch.get(invoice.id) ?? 0;
      const available = Math.max(0, invoice.remaining - reserved);

      if (available <= 0) {
        errorsList.push("Invoice sudah lunas");
      } else {
        if (row.lunas_penuh) amount = available;
        if (amount <= 0) errorsList.push("Jumlah pembayaran harus > 0");
        else if (amount > available + 0.01) {
          errorsList.push(`Jumlah melebihi sisa tagihan (${available})`);
        } else {
          reservedInBatch.set(invoice.id, reserved + amount);
        }
      }
    }

    if (!row.payment_method.trim()) {
      errorsList.push("Metode bayar wajib diisi");
    } else {
      const pm = findPaymentMethod(methods, row.payment_method);
      if (!pm) errorsList.push(`Metode bayar "${row.payment_method}" tidak dikenali`);
      else paymentMethodId = pm.id;
    }

    if (errorsList.length > 0) {
      status = "error";
      errors++;
    } else {
      status = "valid";
      valid++;
    }

    await createPaymentImportLine({
      batch: batchId,
      row_no: row.rowNo,
      invoice_no: row.invoice_no.trim(),
      invoice: invoice?.id,
      payment_date: row.payment_date,
      amount: row.lunas_penuh && invoice ? Math.min(amount, invoice.remaining) : amount,
      payment_method_label: row.payment_method.trim(),
      payment_method: paymentMethodId,
      reference_no: row.reference_no,
      notes: row.notes,
      lunas_penuh: row.lunas_penuh,
      validation_status: status,
      error_message: errorsList.length ? errorsList.join("; ") : undefined,
    });
  }

  await updatePaymentImportBatch(batchId, {
    status: errors > 0 && valid === 0 ? "draft" : valid > 0 ? "validated" : "draft",
    total_rows: rows.length,
    valid_rows: valid,
    error_rows: errors,
  });

  return { valid, errors };
}

/** Batalkan batch yang belum ada pembayaran terposting. */
export async function cancelPaymentImportBatch(batchId: string): Promise<void> {
  const batch = await fetchPaymentImportBatch(batchId);
  if (batch.status === "cancelled") return;
  if (batch.posted_rows > 0) {
    throw new Error(
      "Batch sudah ada pelunasan terposting. Batalkan manual lewat invoice jika perlu koreksi.",
    );
  }

  const lines = await fetchPaymentImportLines(batchId);
  for (const line of lines) {
    if (line.validation_status === "posted") continue;
    await updatePaymentImportLine(line.id, {
      validation_status: "skipped",
      error_message: "Batch dibatalkan",
    });
  }

  await updatePaymentImportBatch(batchId, { status: "cancelled" });
}

export async function createPaymentImportBatchFromFile(
  rows: ParsedPaymentImportRow[],
  userId: string,
  filename?: string,
): Promise<PaymentImportBatch> {
  const batchNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.payImp);
  const batch = await createPaymentImportBatch({
    batch_no: batchNo,
    status: "draft",
    total_rows: rows.length,
    valid_rows: 0,
    error_rows: 0,
    posted_rows: 0,
    source_filename: filename,
    created_by: userId,
  });

  await processPaymentImportRows(batch.id, rows);
  return fetchPaymentImportBatch(batch.id);
}
