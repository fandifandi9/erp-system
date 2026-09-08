import type PocketBase from "pocketbase";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { postAutoStockMovementServer } from "@/lib/inventory/auto-stock-server";
import { resolveMovementLinesFromSale } from "@/lib/catalog/sale-stock-lines";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import { syncInvoiceNoToSalesOrderWorkflow } from "@/lib/wms/sync-invoice-to-workflow";
import { salesOrderHoldBlockedInBisnis } from "@/lib/wms/sales-warehouse-process";
import { canCreateInvoiceFromSalesOrder, invoiceBlockedReason } from "@/lib/bisnis/sales-warehouse";
import { resolveInvoiceNoForSalesOrder } from "@/lib/bisnis/doc-number";
import { enrichInvoiceWithStore } from "@/lib/tenant/invoice-enrich";
import { resolveStoreIdFromSalesOrder } from "@/lib/tenant/resolve-store";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import { generateInvoiceShareToken } from "@/lib/bisnis/invoice-share-token";
import { BISNIS_COLLECTIONS, type Invoice, type SalesOrder, type SalesOrderLine } from "@/lib/bisnis/types";
import { hasPostedSalesStockOut } from "@/lib/bisnis/sales-retur-guards";

async function fetchSo(adminPb: PocketBase, soId: string): Promise<SalesOrder> {
  try {
    return await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
      expand: "customer,store,warehouse",
      requestKey: null,
    });
  } catch {
    return await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
      requestKey: null,
    });
  }
}

async function fetchInvoiceBySo(adminPb: PocketBase, soId: string): Promise<Invoice | null> {
  const list = await adminPb.collection(BISNIS_COLLECTIONS.invoices).getFullList<Invoice>({
    filter: `sales_order = "${soId.replace(/"/g, '\\"')}"`,
    sort: "-created",
    requestKey: null,
  });
  return list[0] ?? null;
}

async function applySalesStockServer(adminPb: PocketBase, so: SalesOrder, userId: string): Promise<void> {
  if (!so.warehouse) return;
  const posted = await hasPostedSalesStockOut(adminPb, so.id, so.order_no);
  if (posted) return;

  const lines = await adminPb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList<SalesOrderLine>({
    filter: `sales_order = "${so.id.replace(/"/g, '\\"')}"`,
    requestKey: null,
  });
  if (lines.length === 0) throw new Error("SO tidak punya item produk");

  const stockLines = await resolveMovementLinesFromSale(
    adminPb,
    lines.map((l) => ({ product: l.product, qty: l.qty, sales_order_line_id: l.id })),
  );

  await postAutoStockMovementServer({
    type: "SALE",
    warehouse: so.warehouse,
    reference_type: "SALES_ORDER",
    reference_id: so.id,
    reference_no: so.order_no,
    lines: stockLines,
    userId,
  });
}

function assertWmsPickReady(so: SalesOrder, wmsPickComplete?: boolean) {
  if (!wmsPickComplete) {
    const blocked = invoiceBlockedReason(so);
    if (!canCreateInvoiceFromSalesOrder(so)) {
      throw new Error(blocked ?? "SO belum siap untuk invoice.");
    }
    return;
  }
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  if (!wf.pick?.completed_at) {
    throw new Error("Picking belum selesai — invoice WMS belum bisa dibuat.");
  }
}

/**
 * Pastikan invoice + stok keluar — seluruhnya admin PB (aman untuk WMS staff).
 */
export async function ensureInvoiceAndStockFromSalesOrderServer(
  soId: string,
  userId: string,
  opts?: { wmsPickComplete?: boolean; isCash?: boolean; invoiceNo?: string },
): Promise<Invoice> {
  const adminPb = await getInventoryAdminPb();
  const so = await fetchSo(adminPb, soId);

  if (so.status === "cancelled") {
    throw new Error("SO dibatalkan tidak bisa dibuat invoice");
  }

  const existing = await fetchInvoiceBySo(adminPb, soId);
  if (existing && existing.status !== "cancelled") {
    await applySalesStockServer(adminPb, so, userId);
    if (so.status === "draft") {
      await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).update(so.id, { status: "confirmed" });
    }
    try {
      await syncInvoiceNoToSalesOrderWorkflow(adminPb, so, existing.invoice_no);
    } catch {
      /* meta sync sekunder — jangan gagalkan ensure */
    }
    return existing;
  }

  const holdBlock = salesOrderHoldBlockedInBisnis(so);
  if (holdBlock) throw new Error(holdBlock);
  await assertWmsPickReady(so, opts?.wmsPickComplete);

  const lines = await adminPb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList<SalesOrderLine>({
    filter: `sales_order = "${soId.replace(/"/g, '\\"')}"`,
    requestKey: null,
  });
  if (lines.length === 0) throw new Error("SO tidak punya item produk");

  const isCash = !!opts?.isCash;
  const invoiceNo =
    opts?.invoiceNo?.trim() ||
    (await resolveInvoiceNoForSalesOrder(so.order_no, { periodDate: so.order_date }));

  const storeId = resolveStoreIdFromSalesOrder(so) || so.store;
  const invBase: Partial<Invoice> = {
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
    platform_source: so.platform_source,
    created_by: userId,
    share_token: generateInvoiceShareToken(),
    ...(storeId ? { store: storeId } : {}),
  };

  let payload: Partial<Invoice> = invBase;
  if (storeId) {
    try {
      payload = await enrichInvoiceWithStore(invBase, storeId);
    } catch {
      payload = invBase;
    }
  }
  const inv = await adminPb.collection(BISNIS_COLLECTIONS.invoices).create<Invoice>(payload);

  try {
    await applySalesStockServer(adminPb, so, userId);
    if (so.status === "draft") {
      await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).update(so.id, { status: "confirmed" });
    }
  } catch (e) {
    // Invoice sudah ada — retry stok di pemanggilan berikutnya.
    throw e;
  }

  void emitBusinessEventServer(adminPb, {
    event_code: "sales.invoice.auto_from_wms_pick",
    module: "sales",
    entity_type: "biz_invoices",
    entity_id: inv.id,
    entity_label: inv.invoice_no,
    store_id: storeId,
    warehouse_id: so.warehouse,
    payload: { invoice_no: inv.invoice_no, order_no: so.order_no },
    actor_id: userId,
  });

  try {
    await syncInvoiceNoToSalesOrderWorkflow(adminPb, so, inv.invoice_no);
  } catch {
    /* meta sync sekunder */
  }

  return inv;
}
