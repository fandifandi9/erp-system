import { pb } from "@/lib/pocketbase";
import {
  applySalesStockOnly,
  createInvoice,
  fetchSalesOrder,
  fetchSalesOrderLines,
  updateSalesOrder,
} from "./client";
import { validateStockForSale } from "./stock-check";
import { BIZ_DOC_NUMBER_CONFIG, nextDocNo } from "./doc-number";
import {
  canCreateInvoiceFromSalesOrder,
  invoiceBlockedReason,
} from "./sales-warehouse";
import { salesOrderHoldBlockedInBisnis } from "@/lib/wms/sales-warehouse-process";
import { BISNIS_COLLECTIONS, type Invoice, type SalesOrder } from "./types";

export async function fetchInvoiceBySalesOrder(soId: string): Promise<Invoice | null> {
  const list = await pb.collection(BISNIS_COLLECTIONS.invoices).getFullList<Invoice>({
    filter: `sales_order = "${soId}"`,
    sort: "-created",
    requestKey: null,
  });
  return list[0] ?? null;
}

/** Buat invoice dari SO yang sudah ada, lalu posting stok keluar. */
export async function createInvoiceFromSalesOrder(
  soId: string,
  userId: string,
  opts?: { isCash?: boolean },
): Promise<Invoice> {
  const existing = await fetchInvoiceBySalesOrder(soId);
  if (existing) {
    throw new Error(`SO ini sudah punya invoice: ${existing.invoice_no}`);
  }

  const so = await fetchSalesOrder(soId);
  if (so.status === "cancelled") {
    throw new Error("SO dibatalkan tidak bisa dibuat invoice");
  }

  const holdBlock = salesOrderHoldBlockedInBisnis(so);
  if (holdBlock) throw new Error(holdBlock);

  const blocked = invoiceBlockedReason(so);
  if (!canCreateInvoiceFromSalesOrder(so)) {
    throw new Error(blocked ?? "SO belum siap untuk invoice.");
  }

  const lines = await fetchSalesOrderLines(soId);
  if (lines.length === 0) {
    throw new Error("SO tidak punya item produk");
  }

  if (so.warehouse) {
    const stockMsg = await validateStockForSale(
      so.warehouse,
      lines.map((l) => ({
        product: l.product,
        productName: l.name_snapshot || l.expand?.product?.name,
        qty: l.qty,
      })),
    );
    if (stockMsg) throw new Error(stockMsg);
  }

  const isCash = !!opts?.isCash;
  const invoiceNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.inv, {
    periodDate: so.order_date,
  });

  const inv = await createInvoice({
    invoice_no: invoiceNo,
    sales_order: so.id,
    customer: so.customer,
    issue_date: so.order_date,
    due_date: so.due_date || so.order_date,
    subtotal: so.subtotal,
    discount_amount: so.discount_amount,
    tax_amount: so.tax_amount,
    materai_amount: so.materai_amount,
    total: so.total,
    paid_amount: isCash ? so.total : 0,
    remaining: isCash ? 0 : so.total,
    status: isCash ? "paid" : "unpaid",
    is_cash: isCash,
    notes: so.notes,
    created_by: userId,
  });

  if (so.warehouse) {
    await applySalesStockOnly(so.id, {
      warehouse: so.warehouse,
      reference_no: so.order_no,
      lines: lines.map((l) => ({ product: l.product, qty: l.qty })),
    });
  }

  await updateSalesOrder(so.id, { status: "confirmed" });

  return inv;
}

export { canEditSalesOrderDoc as canEditSalesOrder } from "./order-doc-status";
