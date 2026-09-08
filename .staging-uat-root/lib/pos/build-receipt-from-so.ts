import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type Invoice, type SalesOrder } from "@/lib/bisnis/types";
import { isCashPaymentMethod } from "@/lib/bisnis/payment-method-value";
import { parsePosNotes } from "@/lib/pos/meta";
import type { PosReceiptData, PosReceiptLine } from "@/lib/pos/receipt";
import { resolvePosPickupNo } from "@/lib/pos/pickup-resolve";

type InvoiceReceiptFields = Pick<Invoice, "id" | "invoice_no" | "paid_amount" | "total" | "is_cash"> & {
  payment_method?: string;
};

export async function buildPosReceiptFromSalesOrder(
  adminPb: PocketBase,
  salesOrderId: string,
  opts?: { invoiceId?: string },
): Promise<PosReceiptData | null> {
  const so = await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(
    salesOrderId,
    {
      expand: "warehouse,customer",
      fields:
        "order_no,subtotal,discount_amount,total,created,payment_method,notes,warehouse,pk_no,wms_booking_no,outbound_workflow_json",
    },
  );

  const meta = parsePosNotes(so.notes);
  if (!meta) return null;

  const lineRows = await adminPb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList({
    filter: `sales_order = "${salesOrderId}"`,
    sort: "created",
    fields: "name_snapshot,sku_snapshot,qty,unit_price,line_total",
  });

  const lines: PosReceiptLine[] = lineRows.map((l) => ({
    name: String((l as { name_snapshot?: string }).name_snapshot ?? "Item"),
    sku: (l as { sku_snapshot?: string }).sku_snapshot,
    qty: Number((l as { qty?: number }).qty) || 0,
    unitPrice: Number((l as { unit_price?: number }).unit_price) || 0,
    lineTotal: Number((l as { line_total?: number }).line_total) || 0,
  }));

  let invoiceNo: string | undefined;
  let invoiceId = opts?.invoiceId;
  let payAmount = Number(so.total) || 0;
  let change = 0;
  let isCashPayment = false;
  let paymentMethodName = so.payment_method ?? undefined;

  if (meta.mode === "direct") {
    let inv: InvoiceReceiptFields | null = null;
    if (invoiceId) {
      inv = await adminPb.collection(BISNIS_COLLECTIONS.invoices).getOne<InvoiceReceiptFields>(invoiceId, {
        fields: "id,invoice_no,paid_amount,total,is_cash,payment_method",
      });
    } else {
      const invList = await adminPb.collection(BISNIS_COLLECTIONS.invoices).getList<InvoiceReceiptFields>(1, 1, {
        filter: `sales_order = "${salesOrderId}"`,
        sort: "-created",
        fields: "id,invoice_no,paid_amount,total,is_cash,payment_method",
      });
      inv = invList.items[0] ?? null;
      invoiceId = inv?.id;
    }
    if (inv) {
      invoiceNo = inv.invoice_no;
      payAmount = Number(inv.paid_amount) || Number(inv.total) || 0;
      isCashPayment = !!inv.is_cash || isCashPaymentMethod({ name: inv.payment_method ?? so.payment_method ?? "", code: "" });
      if (isCashPayment) {
        change = Math.max(0, payAmount - (Number(inv.total) || 0));
      }
      paymentMethodName = inv.payment_method ?? so.payment_method ?? paymentMethodName;
    }
  }

  const { pickupNo, pickupType } = resolvePosPickupNo(so);

  const warehouseName =
    so.expand?.warehouse && typeof so.expand.warehouse === "object"
      ? (so.expand.warehouse as { name?: string }).name
      : undefined;

  return {
    orderNo: String(so.order_no ?? ""),
    invoiceNo,
    invoiceId,
    salesOrderId,
    mode: meta.mode,
    storeName: meta.store_name ?? "Toko",
    warehouseName,
    registerName: meta.register_name ?? "POS",
    registerCode: "",
    cashierName: meta.cashier_name?.trim() || "Kasir",
    buyerName: meta.buyer_name?.trim() || undefined,
    buyerPhone: meta.buyer_phone?.trim() || undefined,
    channelName: meta.channel_name,
    pickupNo: meta.mode === "wms" ? pickupNo : undefined,
    pickupType,
    paymentMethodName,
    isCashPayment,
    lines,
    subtotal: Number(so.subtotal) || 0,
    discountAmount: Number(so.discount_amount) || 0,
    total: Number(so.total) || 0,
    payAmount,
    change,
    completedAt: String(so.created ?? new Date().toISOString()),
  };
}
