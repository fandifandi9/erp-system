import type PocketBase from "pocketbase";
import { bizStockNoteMatches } from "@/lib/bisnis/stock-notes";
import { BISNIS_COLLECTIONS, type PurchaseBill, type PurchaseOrder, type Retur, type ReturLine } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

const RETURNABLE_PO_STATUSES = new Set(["received", "sent", "confirmed"]);

export function canCreatePurchaseRetur(po: Pick<PurchaseOrder, "status">): boolean {
  return RETURNABLE_PO_STATUSES.has(po.status);
}

export async function findActiveBillForPurchaseOrder(
  pb: PocketBase,
  poId: string,
): Promise<PurchaseBill | null> {
  const list = await pb.collection(BISNIS_COLLECTIONS.purchaseBills).getList<PurchaseBill>(1, 1, {
    filter: `purchase_order = "${poId}" && status != "cancelled"`,
    sort: "-created",
  });
  return list.items[0] ?? null;
}

export async function hasPostedPurchaseStockIn(
  pb: PocketBase,
  poId: string,
  poNo: string,
): Promise<boolean> {
  const list = await pb.collection(INV_COLLECTIONS.movements).getFullList({
    filter: 'status = "posted" && movement_type = "IN"',
    sort: "-created",
    requestKey: null,
  });
  return list.some((row) => {
    const m = row as { reference_id?: string; reference_type?: string; notes?: string };
    if (m.reference_type === "PURCHASE_ORDER" && m.reference_id === poId) return true;
    return bizStockNoteMatches(m.notes, {
      referenceId: poId,
      referenceType: "PURCHASE_ORDER",
      referenceNo: poNo,
    });
  });
}

export async function findOpenPurchaseRetur(pb: PocketBase, poId: string, excludeReturId?: string) {
  const parts = [
    `purchase_order = "${poId}"`,
    `(status = "draft" || status = "approved")`,
  ];
  if (excludeReturId) parts.push(`id != "${excludeReturId}"`);
  const list = await pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, 1, {
    filter: parts.join(" && "),
    sort: "-created",
  });
  return list.items[0] ?? null;
}

export async function sumReturnedQtyForPoLine(
  pb: PocketBase,
  poLineId: string,
  excludeReturId?: string,
): Promise<number> {
  const filterParts = [`purchase_order_line = "${poLineId}"`];
  if (excludeReturId) filterParts.push(`retur != "${excludeReturId}"`);
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

export async function getPurchaseOrderTotalQty(pb: PocketBase, poId: string): Promise<number> {
  const lines = await pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).getFullList({
    filter: `purchase_order = "${poId}"`,
    requestKey: null,
  });
  return lines.reduce((s, l) => s + (Number((l as { qty?: number }).qty) || 0), 0);
}

export async function isPurchaseOrderFullyReturnedAfter(
  pb: PocketBase,
  poId: string,
  thisReturQty: number,
  excludeReturId?: string,
): Promise<boolean> {
  const total = await getPurchaseOrderTotalQty(pb, poId);
  if (total <= 0) return false;
  const returs = await pb.collection(BISNIS_COLLECTIONS.returs).getFullList<Retur>({
    filter: `(purchase_order = "${poId}") && status = "completed"${excludeReturId ? ` && id != "${excludeReturId}"` : ""}`,
    requestKey: null,
  });
  let already = 0;
  for (const r of returs) {
    const ls = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList({
      filter: `retur = "${r.id}"`,
      requestKey: null,
    });
    already += ls.reduce((s, l) => s + (Number((l as { qty?: number }).qty) || 0), 0);
  }
  return already + thisReturQty >= total;
}

export async function assertPurchaseReturEligible(
  pb: PocketBase,
  poId: string,
  poNo: string,
  opts?: { excludeReturId?: string; skipOpenReturCheck?: boolean },
): Promise<PurchaseBill> {
  const bill = await findActiveBillForPurchaseOrder(pb, poId);
  if (!bill) {
    throw new Error("Retur pembelian hanya dari PO yang sudah punya tagihan aktif.");
  }
  const stockIn = await hasPostedPurchaseStockIn(pb, poId, poNo);
  if (!stockIn) {
    throw new Error("Stok pembelian belum masuk — buat tagihan / posting stok dulu.");
  }
  if (!opts?.skipOpenReturCheck) {
    const open = await findOpenPurchaseRetur(pb, poId, opts?.excludeReturId);
    if (open) {
      throw new Error(`Sudah ada retur pembelian terbuka: ${open.retur_no}.`);
    }
  }
  return bill;
}
