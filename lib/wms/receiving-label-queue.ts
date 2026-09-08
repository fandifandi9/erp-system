import {
  fetchPurchaseOrder,
  fetchPurchaseOrderLines,
  fetchPurchaseOrders,
  purchaseOrdersReceivingPbFilter,
  updatePurchaseOrder,
} from "@/lib/bisnis/client";
import type { BarcodeLabelItem } from "@/lib/inventory/barcode-label-engine";
import {
  mergeWorkflowWithLines,
  parseReceivingWorkflow,
  serializeReceivingWorkflow,
} from "@/lib/wms/receiving-workflow";

export type ReceivingLabelRequest = {
  poId: string;
  lineId: string;
  poNo: string;
  productName: string;
  sku: string;
  barcode: string;
  qty: number;
  item: BarcodeLabelItem;
};

/** Baris PO di antrian penerimaan yang labelnya belum dicetak. */
export async function fetchPendingReceivingLabelRequests(): Promise<ReceivingLabelRequest[]> {
  const res = await fetchPurchaseOrders({
    page: 1,
    perPage: 100,
    filter: purchaseOrdersReceivingPbFilter(),
    sort: "-send_to_warehouse_at",
  });

  const requests: ReceivingLabelRequest[] = [];

  for (const po of res.items) {
    const lines = await fetchPurchaseOrderLines(po.id);
    const qtyMap = Object.fromEntries(lines.map((l) => [l.id, l.qty]));
    const wf = mergeWorkflowWithLines(
      parseReceivingWorkflow(po.receiving_workflow_json),
      lines.map((l) => l.id),
      qtyMap,
    );

    for (const line of lines) {
      const st = wf.lines[line.id];
      if (st?.label_printed) continue;

      const product = line.expand?.product;
      if (!product) continue;

      const sku = (product.sku ?? "").trim();
      const barcode = ((product as { barcode?: string }).barcode ?? "").trim() || sku;
      if (!barcode) continue;

      const qty = Math.max(1, Math.min(500, Math.floor(st?.label_print_qty ?? line.qty)));
      const productName = product.name ?? sku;

      requests.push({
        poId: po.id,
        lineId: line.id,
        poNo: po.po_no,
        productName,
        sku,
        barcode,
        qty,
        item: {
          encodeValue: barcode,
          title: [productName, po.po_no].filter(Boolean).join(" · "),
          copies: qty,
        },
      });
    }
  }

  return requests;
}

/** Tandai label baris PO sudah dicetak — hilang dari antrian barcode. */
export async function markReceivingLineLabelPrinted(
  poId: string,
  lineId: string,
  labelQty: number,
): Promise<void> {
  const po = await fetchPurchaseOrder(poId);
  const lines = await fetchPurchaseOrderLines(poId);
  const qtyMap = Object.fromEntries(lines.map((l) => [l.id, l.qty]));
  const wf = mergeWorkflowWithLines(
    parseReceivingWorkflow(po.receiving_workflow_json),
    lines.map((l) => l.id),
    qtyMap,
  );

  const prev = wf.lines[lineId] ?? {
    qc_ok: false,
    label_printed: false,
    label_print_qty: labelQty,
  };

  wf.lines[lineId] = {
    ...prev,
    label_printed: true,
    label_print_qty: labelQty,
  };

  await updatePurchaseOrder(poId, {
    receiving_workflow_json: serializeReceivingWorkflow(wf),
  });
}
