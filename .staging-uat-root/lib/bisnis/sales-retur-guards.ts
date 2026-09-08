import type PocketBase from "pocketbase";
import { bizStockNoteMatches } from "@/lib/bisnis/stock-notes";
import { BISNIS_COLLECTIONS, type Invoice, type Retur, type ReturLine } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

const RETURNABLE_SO_STATUSES = new Set(["confirmed", "processing", "shipped", "delivered"]);

export function canCreateSalesRetur(so: { status: string }): boolean {
  return RETURNABLE_SO_STATUSES.has(so.status);
}

/** Mutasi stok keluar penjualan (SALES_ORDER) sudah terposting. */
export async function hasPostedSalesStockOut(
  pb: PocketBase,
  soId: string,
  orderNo: string,
): Promise<boolean> {
  const filters = ['status = "posted"', 'movement_type = "OUT"'];
  const list = await pb.collection(INV_COLLECTIONS.movements).getFullList({
    filter: filters.join(" && "),
    sort: "-created",
    requestKey: null,
  });

  return list.some((row) => {
    const m = row as { reference_id?: string; reference_type?: string; notes?: string };
    if (m.reference_type === "SALES_ORDER" && m.reference_id === soId) return true;
    return bizStockNoteMatches(m.notes, {
      referenceId: soId,
      referenceType: "SALES_ORDER",
      referenceNo: orderNo,
    });
  });
}

export async function findActiveInvoiceForSalesOrder(
  pb: PocketBase,
  salesOrderId: string,
): Promise<Invoice | null> {
  const invList = await pb.collection(BISNIS_COLLECTIONS.invoices).getList<Invoice>(1, 1, {
    filter: `sales_order = "${salesOrderId}" && status != "cancelled"`,
    sort: "-created",
  });
  return invList.items[0] ?? null;
}

/** Retur draf/approved yang masih terbuka untuk SO ini. */
export async function findOpenReturForSalesOrder(
  pb: PocketBase,
  salesOrderId: string,
  excludeReturId?: string,
): Promise<Retur | null> {
  const parts = [
    `sales_order = "${salesOrderId}"`,
    `(status = "draft" || status = "approved")`,
  ];
  if (excludeReturId) parts.push(`id != "${excludeReturId}"`);
  const list = await pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, 1, {
    filter: parts.join(" && "),
    sort: "-created",
  });
  return list.items[0] ?? null;
}

export async function sumReturnedQtyForSoLine(
  pb: PocketBase,
  salesOrderLineId: string,
  excludeReturId?: string,
): Promise<number> {
  const filterParts = [`sales_order_line = "${salesOrderLineId}"`];
  if (excludeReturId) {
    filterParts.push(`retur != "${excludeReturId}"`);
  }
  const lines = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLine>({
    filter: filterParts.join(" && "),
    expand: "retur",
    requestKey: null,
  });
  let sum = 0;
  for (const line of lines) {
    const retur = line.expand?.retur as Retur | undefined;
    if (retur?.status === "completed") sum += Number(line.qty) || 0;
  }
  return sum;
}

/** Total qty yang sudah diretur (completed) untuk satu SO. */
export async function sumReturnedQtyForSalesOrder(
  pb: PocketBase,
  salesOrderId: string,
  excludeReturId?: string,
): Promise<number> {
  const filterParts = [
    `(sales_order = "${salesOrderId}" || reference_id = "${salesOrderId}")`,
    `status = "completed"`,
  ];
  if (excludeReturId) {
    filterParts.push(`id != "${excludeReturId}"`);
  }
  const returs = await pb.collection(BISNIS_COLLECTIONS.returs).getFullList<Retur>({
    filter: filterParts.join(" && "),
    requestKey: null,
  });
  if (!returs.length) return 0;

  let total = 0;
  for (const r of returs) {
    const lines = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLine>({
      filter: `retur = "${r.id}"`,
      requestKey: null,
    });
    total += lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  }
  return total;
}

export async function getSalesOrderTotalQty(pb: PocketBase, salesOrderId: string): Promise<number> {
  const soLines = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList({
    filter: `sales_order = "${salesOrderId}"`,
    requestKey: null,
  });
  return soLines.reduce((s, l) => s + (Number((l as { qty?: number }).qty) || 0), 0);
}

/** Apakah setelah retur ini seluruh qty SO sudah kembali. */
export async function isSalesOrderFullyReturnedAfter(
  pb: PocketBase,
  salesOrderId: string,
  thisReturQty: number,
  excludeReturId?: string,
): Promise<boolean> {
  const totalSoQty = await getSalesOrderTotalQty(pb, salesOrderId);
  if (totalSoQty <= 0) return false;
  const already = await sumReturnedQtyForSalesOrder(pb, salesOrderId, excludeReturId);
  return already + thisReturQty >= totalSoQty;
}

export async function assertSalesReturEligible(
  pb: PocketBase,
  salesOrderId: string,
  orderNo: string,
  opts?: { excludeReturId?: string; skipOpenReturCheck?: boolean },
): Promise<Invoice> {
  const invoice = await findActiveInvoiceForSalesOrder(pb, salesOrderId);
  if (!invoice) {
    throw new Error("Retur hanya bisa dari penjualan yang sudah punya invoice aktif.");
  }
  const stockOut = await hasPostedSalesStockOut(pb, salesOrderId, orderNo);
  if (!stockOut) {
    throw new Error(
      "Stok penjualan belum keluar (belum ada mutasi OUT terposting). Buat invoice / posting stok dulu.",
    );
  }
  if (!opts?.skipOpenReturCheck) {
    const open = await findOpenReturForSalesOrder(pb, salesOrderId, opts?.excludeReturId);
    if (open) {
      throw new Error(`Sudah ada retur terbuka: ${open.retur_no}. Selesaikan atau batalkan dulu.`);
    }
  }
  return invoice;
}
