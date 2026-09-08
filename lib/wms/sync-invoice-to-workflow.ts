import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import {
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
} from "@/lib/wms/outbound-workflow";

/** Tulis nomor invoice ke order_meta agar antrean Validasi/Siap ambil menampilkan INV. */
export async function syncInvoiceNoToSalesOrderWorkflow(
  pb: PocketBase,
  so: SalesOrder,
  invoiceNo: string,
): Promise<void> {
  const no = invoiceNo.trim();
  if (!no) return;
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  if (wf.order_meta?.invoice_no?.trim() === no) return;
  const next = {
    ...wf,
    order_meta: {
      ...wf.order_meta,
      order_no: wf.order_meta?.order_no?.trim() || so.order_no,
      invoice_no: no,
    },
  };
  await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(so.id, {
    outbound_workflow_json: serializeOutboundWorkflow(next),
  });
}
