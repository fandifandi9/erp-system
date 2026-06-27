import type { SalesOrder, SalesOrderLine } from "@/lib/bisnis/types";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { serializeOutboundWorkflow, type OutboundWorkflow } from "./outbound-workflow";
import { fetchInvoiceNoForSo } from "./wms-order-display";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { resolveAndAssignPackageIdentity } from "./package-identity";
import { mergeOutboundLinesFromSoExpanded } from "./outbound-bundle-expand";

/** Inisialisasi WMS order saat SO masuk antrean gudang — satu identitas paket aktif. */
export async function buildInitialOutboundWorkflow(
  so: SalesOrder,
  lines: SalesOrderLine[],
  opts?: { userId?: string; userName?: string },
): Promise<string> {
  const { shipping } = parseNotesWithShipping(so.notes ?? "");
  const invoiceNo = await fetchInvoiceNoForSo(so.id);
  const pb = await getInventoryAdminPb();

  const now = new Date().toISOString();
  let wf: OutboundWorkflow = {
    stage: "new_order",
    stage_entered_at: now,
    order_meta: {
      order_no: so.order_no,
      invoice_no: invoiceNo ?? undefined,
      warehouse_id: so.warehouse,
      warehouse_name: so.expand?.warehouse?.name,
      customer_name: so.expand?.customer?.name,
      courier: shipping.courier || undefined,
      recipient_address: shipping.recipient_address || undefined,
    },
    pick: {
      user_id: opts?.userId ?? "",
      user_name: opts?.userName,
      started_at: "",
      completed_at: "",
      lines: {},
    },
  };

  wf = await mergeOutboundLinesFromSoExpanded(pb, wf, lines);

  const { workflow } = await resolveAndAssignPackageIdentity(so, wf);
  return serializeOutboundWorkflow(workflow);
}
