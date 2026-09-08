import {
  fetchInvoice,
  fetchPurchaseBill,
  fetchPurchaseOrder,
  fetchPurchaseOrderLines,
  fetchSalesOrder,
  fetchSalesOrderLines,
} from "@/lib/bisnis/client";
import {
  buildBillPrintData,
  buildInvoicePrintData,
  buildPurchaseOrderPrintData,
  buildSalesOrderPrintData,
} from "@/lib/bisnis/doc-print-mappers";
import type { BizDocumentPrintData } from "@/lib/bisnis/doc-print-types";
import type { Store } from "@/lib/bisnis/types";

export type PostSavePayload = {
  docNo: string;
  docLabel: string;
  detailUrl: string;
  printData: BizDocumentPrintData;
};

export async function buildSalesPostSavePayload(
  target: { kind: "invoice"; invoiceId: string; soId: string } | { kind: "so"; soId: string },
  store: Store | null | undefined,
): Promise<PostSavePayload> {
  if (target.kind === "invoice") {
    const inv = await fetchInvoice(target.invoiceId);
    const lines = await fetchSalesOrderLines(target.soId);
    return {
      docNo: inv.invoice_no,
      docLabel: "Invoice",
      detailUrl: `/bisnis/penjualan/${target.invoiceId}`,
      printData: buildInvoicePrintData(inv, lines, store),
    };
  }
  const so = await fetchSalesOrder(target.soId);
  const lines = await fetchSalesOrderLines(target.soId);
  return {
    docNo: so.order_no,
    docLabel: "Sales Order",
    detailUrl: `/bisnis/penjualan/${target.soId}`,
    printData: buildSalesOrderPrintData(so, lines, store),
  };
}

export async function buildPurchasePostSavePayload(
  target: { kind: "bill"; billId: string; poId: string } | { kind: "po"; poId: string },
  store: Store | null | undefined,
): Promise<PostSavePayload> {
  if (target.kind === "bill") {
    const bill = await fetchPurchaseBill(target.billId);
    const po = await fetchPurchaseOrder(target.poId);
    const lines = await fetchPurchaseOrderLines(target.poId);
    return {
      docNo: bill.bill_no,
      docLabel: "Tagihan",
      detailUrl: `/bisnis/pembelian/${target.billId}`,
      printData: buildBillPrintData(bill, lines, store, po.expand?.supplier, po),
    };
  }
  const po = await fetchPurchaseOrder(target.poId);
  const lines = await fetchPurchaseOrderLines(target.poId);
  return {
    docNo: po.po_no,
    docLabel: "Purchase Order",
    detailUrl: `/bisnis/pembelian/${target.poId}`,
    printData: buildPurchaseOrderPrintData(po, lines, store, po.expand?.supplier),
  };
}
