import { fetchPurchaseOrder } from "./client";
import {
  createBillFromPurchaseOrder,
  fetchPurchaseBillByPurchaseOrder,
} from "./purchase-from-po";
import { emitBusinessEvent } from "@/lib/tenant/activity-events";
import { pb } from "@/lib/pocketbase";

function isDuplicateDocError(message: string, kind: "bill" | "invoice"): boolean {
  if (kind === "bill") return /sudah punya tagihan/i.test(message);
  return /sudah punya invoice/i.test(message);
}

async function ensureInvoiceViaApi(soId: string): Promise<void> {
  const token = pb.authStore.token;
  if (!token) throw new Error("User belum login");
  const res = await fetch(`/api/wms/sales-orders/${soId}/ensure-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ wmsPickComplete: true }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) {
    const msg = json.error || "Gagal memastikan invoice.";
    if (isDuplicateDocError(msg, "invoice")) return;
    throw new Error(msg);
  }
}

/** WMS penerimaan selesai → buat tagihan otomatis. Non-WMS: tidak dipanggil (manual dari detail PO). */
export async function autoCreateBillAfterWmsComplete(
  poId: string,
  userId: string,
): Promise<void> {
  const po = await fetchPurchaseOrder(poId);
  if (!po.send_to_warehouse_at) return;
  if (po.warehouse_process_status !== "complete") return;
  if (po.status === "cancelled") return;

  const existing = await fetchPurchaseBillByPurchaseOrder(poId);
  if (existing) return;

  try {
    const bill = await createBillFromPurchaseOrder(poId, userId);
    void emitBusinessEvent({
      event_code: "purchase.bill.auto_from_wms",
      module: "purchase",
      entity_type: "biz_purchase_bills",
      entity_id: bill.id,
      entity_label: bill.bill_no,
      payload: { po_no: po.po_no, ref: bill.bill_no },
      actor_id: userId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isDuplicateDocError(msg, "bill")) return;
    throw e;
  }
}

/** WMS pickup selesai → pastikan invoice + stok (fallback jika belum terbit saat picking). */
export async function autoCreateInvoiceAfterWmsComplete(
  soId: string,
  _userId: string,
): Promise<void> {
  await ensureInvoiceViaApi(soId);
}

/** WMS picking selesai (ACC) → SO/PO → invoice + potong stok. */
export async function autoCreateInvoiceAfterPickComplete(
  soId: string,
  _userId: string,
): Promise<void> {
  await ensureInvoiceViaApi(soId);
}
