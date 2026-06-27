import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { postAutoStockMovementServer } from "@/lib/inventory/auto-stock-server";
import { BIZ_DOC_NUMBER_CONFIG, assertDocNoAvailable, invoiceNoFromSalesOrder, nextDocNo } from "@/lib/bisnis/doc-number";
import { validateStockForSale } from "@/lib/bisnis/stock-check";
import {
  paymentMethodRelationId,
  salesOrderPaymentMethodValue,
} from "@/lib/bisnis/payment-method-value";
import {
  canCreateInvoiceFromSalesOrder,
  invoiceBlockedReason,
} from "@/lib/bisnis/sales-warehouse";
import { salesOrderHoldBlockedInBisnis } from "@/lib/wms/sales-warehouse-process";
import { BISNIS_COLLECTIONS, type Invoice, type PaymentMethodSetting, type SalesOrder } from "@/lib/bisnis/types";
import { findOrCreatePosCustomer } from "@/lib/pos/customer";
import { buildPosNotes } from "@/lib/pos/meta";
import { calcCartTotal, calcCartSubtotal } from "@/lib/pos/cart";
import type { PosCart, PosCheckoutDirect, PosSession } from "@/lib/pos/types";
import { assertPosCartSerials, serializeSerialNumbersJson } from "@/lib/wms/serial-numbers";
import { enrichInvoiceWithStoreServer } from "@/lib/tenant/document-identity-server";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

export type CompleteDirectPosInput = {
  session: PosSession;
  cart: PosCart;
  checkout: PosCheckoutDirect;
  userId: string;
};

export type CompleteDirectPosResult = {
  salesOrderId: string;
  orderNo: string;
  invoiceId: string;
  invoiceNo: string;
};

export async function completeDirectPosSale(
  input: CompleteDirectPosInput,
): Promise<CompleteDirectPosResult> {
  const { session, cart, checkout, userId } = input;
  if (cart.lines.length === 0) throw new Error("Keranjang kosong");
  assertPosCartSerials(cart);

  const customer = await findOrCreatePosCustomer({
    name: checkout.buyerName,
    phone: checkout.buyerPhone,
  });

  const subtotal = calcCartSubtotal(cart);
  const discount = Math.min(cart.discountAmount || 0, subtotal);
  const total = calcCartTotal(cart);
  if (total <= 0) throw new Error("Total transaksi harus lebih dari 0");

  const adminPb = await getInventoryAdminPb();

  const methods = await adminPb
    .collection(BISNIS_COLLECTIONS.paymentMethods)
    .getFullList({ sort: "name", filter: "is_active = true" });
  const pm = methods.find((m) => m.id === checkout.paymentMethodId) as PaymentMethodSetting | undefined;
  if (!pm) throw new Error("Metode pembayaran tidak ditemukan");

  const stockMsg = await validateStockForSale(
    session.warehouseId,
    cart.lines.map((l) => ({
      product: l.productId,
      productName: l.name,
      qty: l.qty,
    })),
    { warehouseName: session.warehouseName },
  );
  if (stockMsg) throw new Error(stockMsg);

  const today = new Date().toISOString().slice(0, 10);
  const orderNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.so, { periodDate: today });

  const notes = buildPosNotes({
    pos: true,
    mode: "direct",
    register_id: session.registerId,
    register_name: session.registerName,
    store_id: session.storeId,
    store_name: session.storeName,
    cashier_user_id: session.cashierUserId,
    cashier_name: session.responsibleName,
    buyer_name: (checkout.buyerName || "Pelanggan Umum").trim(),
    buyer_phone: (checkout.buyerPhone || "").trim(),
  });

  const whRow = await adminPb
    .collection(INV_COLLECTIONS.warehouses)
    .getOne(session.warehouseId, { fields: "company" })
    .catch(() => null);
  const companyId = (whRow as { company?: string } | null)?.company;

  const so = await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).create<SalesOrder>({
    order_no: orderNo,
    customer: customer.id,
    store: session.storeId,
    warehouse: session.warehouseId,
    ...(companyId ? { company: companyId } : {}),
    status: "draft",
    payment_status: "unpaid",
    payment_method: salesOrderPaymentMethodValue(pm),
    order_date: today,
    due_date: today,
    subtotal,
    discount_amount: discount,
    tax_amount: 0,
    total,
    notes,
    created_by: userId,
  });

  for (const line of cart.lines) {
    const serialJson = serializeSerialNumbersJson(line.serials ?? []);
    await adminPb.collection(BISNIS_COLLECTIONS.salesOrderLines).create({
      sales_order: so.id,
      product: line.productId,
      sku_snapshot: line.sku,
      name_snapshot: line.name,
      qty: line.qty,
      unit_price: line.unitPrice,
      discount_percent: 0,
      discount_amount: 0,
      tax_percent: 0,
      line_total: line.lineTotal,
      ...(serialJson ? { serial_numbers_json: serialJson } : {}),
    });
  }

  const holdBlock = salesOrderHoldBlockedInBisnis(so);
  if (holdBlock) throw new Error(holdBlock);

  const blocked = invoiceBlockedReason(so);
  if (!canCreateInvoiceFromSalesOrder(so)) {
    throw new Error(blocked ?? "SO belum siap untuk invoice.");
  }

  const isCash =
    pm.name?.toLowerCase().includes("tunai") ||
    pm.name?.toLowerCase().includes("cash") ||
    checkout.payAmount >= total;

  const invoiceNo = invoiceNoFromSalesOrder(orderNo);
  if (!invoiceNo) {
    throw new Error("Gagal membuat nomor invoice pasangan SO.");
  }
  await assertDocNoAvailable(BIZ_DOC_NUMBER_CONFIG.inv, invoiceNo);

  const invPayload = await enrichInvoiceWithStoreServer(
    adminPb,
    {
      invoice_no: invoiceNo,
      sales_order: so.id,
      customer: customer.id,
      issue_date: today,
      due_date: today,
      subtotal,
      discount_amount: discount,
      tax_amount: 0,
      materai_amount: 0,
      total,
      paid_amount: isCash ? total : 0,
      remaining: isCash ? 0 : total,
      status: isCash ? "paid" : "unpaid",
      is_cash: isCash,
      notes,
      created_by: userId,
    },
    session.storeId,
  );
  const inv = await adminPb.collection(BISNIS_COLLECTIONS.invoices).create<Invoice>(invPayload);

  const { resolveMovementLinesFromSale } = await import("@/lib/catalog/sale-stock-lines");
  const stockLines = await resolveMovementLinesFromSale(
    adminPb,
    cart.lines.map((l) => ({
      product: l.productId,
      qty: l.qty,
      productName: l.name,
    })),
  );
  await postAutoStockMovementServer({
    type: "SALE",
    warehouse: session.warehouseId,
    reference_type: "SALES_ORDER",
    reference_id: so.id,
    reference_no: orderNo,
    lines: stockLines,
    userId,
  });

  await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).update(so.id, {
    status: "confirmed",
    payment_status: isCash ? "paid" : "unpaid",
  });

  const payAmount = Math.min(Math.max(0, checkout.payAmount), total);
  if (!isCash && payAmount > 0) {
    await adminPb.collection(BISNIS_COLLECTIONS.payments).create({
      invoice: inv.id,
      payment_date: today,
      amount: payAmount,
      payment_method: paymentMethodRelationId(pm),
      notes: checkout.notes?.trim() || undefined,
      created_by: userId,
      ...(companyId ? { company: companyId } : {}),
    });
    const newPaid = payAmount;
    const newRemaining = Math.max(0, total - newPaid);
    await adminPb.collection(BISNIS_COLLECTIONS.invoices).update(inv.id, {
      paid_amount: newPaid,
      remaining: newRemaining,
      status: newRemaining <= 0 ? "paid" : "unpaid",
    });
  } else if (isCash && payAmount > 0 && payAmount < total) {
    await adminPb.collection(BISNIS_COLLECTIONS.payments).create({
      invoice: inv.id,
      payment_date: today,
      amount: payAmount,
      payment_method: paymentMethodRelationId(pm),
      notes: checkout.notes?.trim() || undefined,
      created_by: userId,
      ...(companyId ? { company: companyId } : {}),
    });
    const newRemaining = Math.max(0, total - payAmount);
    await adminPb.collection(BISNIS_COLLECTIONS.invoices).update(inv.id, {
      paid_amount: payAmount,
      remaining: newRemaining,
      status: newRemaining <= 0 ? "paid" : "unpaid",
    });
  }

  await emitBusinessEventServer(adminPb, {
    event_code: "sales.order.created",
    module: "sales",
    entity_type: "biz_sales_orders",
    entity_id: so.id,
    entity_label: orderNo,
    store_id: session.storeId,
    warehouse_id: session.warehouseId,
    payload: { order_no: orderNo, pos: true },
    actor_id: userId,
  });
  await emitBusinessEventServer(adminPb, {
    event_code: "sales.invoice.created",
    module: "sales",
    entity_type: "biz_invoices",
    entity_id: inv.id,
    entity_label: inv.invoice_no,
    store_id: session.storeId,
    warehouse_id: session.warehouseId,
    payload: { invoice_no: inv.invoice_no, order_no: orderNo, pos: true },
    actor_id: userId,
  });

  return {
    salesOrderId: so.id,
    orderNo,
    invoiceId: inv.id,
    invoiceNo: inv.invoice_no,
  };
}
