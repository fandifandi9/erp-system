import { fetchPurchaseOrder, fetchSalesOrder } from "./client";
import {
  createBillFromPurchaseOrder,
  fetchPurchaseBillByPurchaseOrder,
} from "./purchase-from-po";
import {
  createInvoiceFromSalesOrder,
  fetchInvoiceBySalesOrder,
} from "./sales-from-so";
import { emitBusinessEvent } from "@/lib/tenant/activity-events";

function isDuplicateDocError(message: string, kind: "bill" | "invoice"): boolean {
  if (kind === "bill") return /sudah punya tagihan/i.test(message);
  return /sudah punya invoice/i.test(message);
}

/** WMS penerimaan selesai → buat tagihan otomatis. Non-WMS: tidak dipanggil (manual dari detail PO). */
export async function autoCreateBillAfterWmsComplete(
  poId: string,
  userId: string,
): Promise<void> {
  const po = await fetchPurchaseOrder(poId);
  if (!po.send_to_warehouse_at) return;
  if (po.warehouse_process_status !== "complete") return;
  if (po.status === "cancelled") return;

  const existing = await fetchPurchaseBillByPurchaseOrder(poId);
  if (existing) return;

  try {
    const bill = await createBillFromPurchaseOrder(poId, userId);
    void emitBusinessEvent({
      event_code: "purchase.bill.auto_from_wms",
      module: "purchase",
      entity_type: "biz_purchase_bills",
      entity_id: bill.id,
      entity_label: bill.bill_no,
      payload: { po_no: po.po_no, ref: bill.bill_no },
      actor_id: userId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isDuplicateDocError(msg, "bill")) return;
    throw e;
  }
}

/** WMS pickup selesai → buat invoice otomatis. Non-WMS: tidak dipanggil (manual dari detail SO). */
export async function autoCreateInvoiceAfterWmsComplete(
  soId: string,
  userId: string,
): Promise<void> {
  const so = await fetchSalesOrder(soId);
  if (!so.send_to_warehouse_at) return;
  if (so.warehouse_process_status !== "complete") return;
  if (so.status === "cancelled") return;

  const existing = await fetchInvoiceBySalesOrder(soId);
  if (existing) return;

  try {
    const invoice = await createInvoiceFromSalesOrder(soId, userId);
    void emitBusinessEvent({
      event_code: "sales.invoice.auto_from_wms",
      module: "sales",
      entity_type: "biz_invoices",
      entity_id: invoice.id,
      entity_label: invoice.invoice_no,
      payload: { order_no: so.order_no, ref: invoice.invoice_no },
      actor_id: userId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isDuplicateDocError(msg, "invoice")) return;
    throw e;
  }
}
