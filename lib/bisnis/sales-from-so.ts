import { pb } from "@/lib/pocketbase";
import { cancelWmsTasksForEntity } from "@/lib/wms/fulfillment";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import {
  applySalesStockOnly,
  createInvoice,
  fetchSalesOrder,
  fetchSalesOrderLines,
  updateSalesOrder,
} from "./client";
import { validateStockForSale } from "./stock-check";
import { BIZ_DOC_NUMBER_CONFIG, resolveInvoiceNoForSalesOrder } from "./doc-number";
import {
  canCreateInvoiceFromSalesOrder,
  invoiceBlockedReason,
} from "./sales-warehouse";
import { salesOrderHoldBlockedInBisnis } from "@/lib/wms/sales-warehouse-process";
import { BISNIS_COLLECTIONS, type Invoice, type SalesOrder } from "./types";
import { enrichInvoiceWithStore } from "@/lib/tenant/invoice-enrich";
import { resolveStoreIdFromSalesOrder } from "@/lib/tenant/resolve-store";
import { emitBusinessEvent } from "@/lib/tenant/activity-events";

export async function fetchInvoiceBySalesOrder(soId: string): Promise<Invoice | null> {
  const list = await pb.collection(BISNIS_COLLECTIONS.invoices).getFullList<Invoice>({
    filter: `sales_order = "${soId}"`,
    sort: "-created",
    requestKey: null,
  });
  return list[0] ?? null;
}

async function assertWmsPickReadyForInvoice(so: SalesOrder, wmsPickComplete?: boolean) {
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

async function applySalesStockIfNeeded(so: SalesOrder): Promise<void> {
  if (!so.warehouse) return;
  const { hasPostedSalesStockOut } = await import("./sales-retur-guards");
  const posted = await hasPostedSalesStockOut(pb, so.id, so.order_no);
  if (posted) return;

  const lines = await fetchSalesOrderLines(so.id);
  if (lines.length === 0) throw new Error("SO tidak punya item produk");

  const stockMsg = await validateStockForSale(
    so.warehouse,
    lines.map((l) => ({
      product: l.product,
      productName: l.name_snapshot || l.expand?.product?.name,
      qty: l.qty,
    })),
  );
  if (stockMsg) throw new Error(stockMsg);

  await applySalesStockOnly(so.id, {
    warehouse: so.warehouse,
    reference_no: so.order_no,
    lines: lines.map((l) => ({
      product: l.product,
      qty: l.qty,
      sales_order_line_id: l.id,
    })),
  });
}

/**
 * Pastikan SO sudah punya invoice + stok keluar + status confirmed.
 * Idempotent — dipakai saat picking ACC dan backfill order yang masih Draf.
 */
export async function ensureInvoiceAndStockFromSalesOrder(
  soId: string,
  userId: string,
  opts?: { isCash?: boolean; invoiceNo?: string; wmsPickComplete?: boolean },
): Promise<Invoice> {
  const so = await fetchSalesOrder(soId);
  if (so.status === "cancelled") {
    throw new Error("SO dibatalkan tidak bisa dibuat invoice");
  }

  const existing = await fetchInvoiceBySalesOrder(soId);
  if (existing) {
    if (existing.status !== "cancelled") {
      await applySalesStockIfNeeded(so);
      if (so.status === "draft") {
        await updateSalesOrder(so.id, { status: "confirmed" });
      }
      return existing;
    }
  }

  return createInvoiceFromSalesOrder(soId, userId, opts);
}

/** Buat invoice dari SO yang sudah ada, lalu posting stok keluar. */
export async function createInvoiceFromSalesOrder(
  soId: string,
  userId: string,
  opts?: { isCash?: boolean; invoiceNo?: string; wmsPickComplete?: boolean },
): Promise<Invoice> {
  const existing = await fetchInvoiceBySalesOrder(soId);
  if (existing && existing.status !== "cancelled") {
    throw new Error(`SO ini sudah punya invoice: ${existing.invoice_no}`);
  }

  const so = await fetchSalesOrder(soId);
  if (so.status === "cancelled") {
    throw new Error("SO dibatalkan tidak bisa dibuat invoice");
  }

  const holdBlock = salesOrderHoldBlockedInBisnis(so);
  if (holdBlock) throw new Error(holdBlock);

  await assertWmsPickReadyForInvoice(so, opts?.wmsPickComplete);

  const lines = await fetchSalesOrderLines(soId);
  if (lines.length === 0) {
    throw new Error("SO tidak punya item produk");
  }

  if (!so.send_to_warehouse_at) {
    const { assertSalesLineSerials, fetchRequiresSerialMap } = await import("@/lib/wms/serial-numbers");
    const productIds = lines.map((l) => l.product).filter(Boolean);
    const requiresMap = await fetchRequiresSerialMap(productIds);
    const nameByProduct = Object.fromEntries(
      lines.map((l) => [l.product, l.name_snapshot || l.expand?.product?.name || l.product]),
    );
    assertSalesLineSerials(
      lines.map((l) => ({
        product: l.product,
        qty: Number(l.qty) || 0,
        serial_numbers_json: l.serial_numbers_json,
        name: nameByProduct[l.product],
      })),
      requiresMap,
      nameByProduct,
    );
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
  const invoiceNo =
    opts?.invoiceNo?.trim() ||
    (await resolveInvoiceNoForSalesOrder(so.order_no, { periodDate: so.order_date }));

  const storeId = resolveStoreIdFromSalesOrder(so) || (so as SalesOrder & { store?: string }).store;
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
  };
  const inv = await createInvoice(
    storeId ? await enrichInvoiceWithStore(invBase, storeId) : invBase,
  );

  try {
    await applySalesStockIfNeeded({ ...so });
    if (so.status === "draft") {
      await updateSalesOrder(so.id, { status: "confirmed" });
    }
  } catch (e) {
    // Invoice sudah ada — biarkan ensure/retry menyelesaikan stok + status.
    throw e;
  }

  void emitBusinessEvent({
    event_code: "sales.invoice.created",
    module: "sales",
    entity_type: "biz_invoices",
    entity_id: inv.id,
    entity_label: inv.invoice_no,
    store_id: storeId,
    warehouse_id: so.warehouse,
    payload: { invoice_no: inv.invoice_no, order_no: so.order_no },
    actor_id: userId,
  });

  return inv;
}

/** Batalkan SO yang belum punya invoice aktif (SO tidak jadi penjualan). */
export async function cancelSalesOrderWithoutInvoice(
  soId: string,
  cancelReason?: string,
): Promise<SalesOrder> {
  const existing = await fetchInvoiceBySalesOrder(soId);
  if (existing && existing.status !== "cancelled") {
    throw new Error(
      `SO sudah punya invoice ${existing.invoice_no}. Batalkan lewat halaman invoice.`,
    );
  }

  const so = await fetchSalesOrder(soId);
  if (so.status === "cancelled") {
    throw new Error("SO sudah dibatalkan.");
  }

  if (
    so.send_to_warehouse_at &&
    so.warehouse_process_status &&
    so.warehouse_process_status !== "complete"
  ) {
    throw new Error(
      "SO masih diproses gudang — selesaikan atau batalkan picking di WMS dulu.",
    );
  }

  const { voidStockMovementsByReference } = await import("./client");
  await voidStockMovementsByReference(
    {
      referenceId: soId,
      referenceType: "SALES_ORDER",
      referenceNo: so.order_no,
    },
    cancelReason?.trim() ? `Batal SO: ${cancelReason.trim()}` : `Batal SO ${so.order_no}`,
  );
  await cancelWmsTasksForEntity("biz_sales_orders", soId);

  return updateSalesOrder(soId, { status: "cancelled" });
}

export { canEditSalesOrderDoc as canEditSalesOrder } from "./order-doc-status";
