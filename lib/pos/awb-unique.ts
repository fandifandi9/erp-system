import type PocketBase from "pocketbase";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { parsePosNotes } from "@/lib/pos/meta";
import { extractAwbFromOrder } from "@/lib/wms/package-identity";

function escapeFilter(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Normalisasi nomor AWB untuk perbandingan. */
export function normalizeAwb(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

function orderBelongsToStore(
  so: Pick<SalesOrder, "notes">,
  storeId: string,
  storeName: string,
): boolean {
  const meta = parsePosNotes(so.notes);
  if (meta?.store_id) return meta.store_id === storeId;
  if (meta?.store_name && storeName) {
    return meta.store_name.trim().toLowerCase() === storeName.trim().toLowerCase();
  }
  return false;
}

function awbOnOrder(so: Pick<SalesOrder, "notes" | "wms_booking_no" | "outbound_workflow_json">): string {
  const fromPkg = extractAwbFromOrder(so);
  if (fromPkg) return normalizeAwb(fromPkg);
  const meta = parsePosNotes(so.notes);
  if (meta?.shipping?.awb) return normalizeAwb(meta.shipping.awb);
  const { shipping } = parseNotesWithShipping(so.notes);
  if (shipping.tracking_no) return normalizeAwb(shipping.tracking_no);
  const m = so.notes?.match(/^AWB:\s*(.+)$/im);
  if (m?.[1]) return normalizeAwb(m[1]);
  if (so.wms_booking_no) return normalizeAwb(so.wms_booking_no);
  return "";
}

/** Cari pesanan lain di toko yang sama dengan AWB identik. */
export async function findDuplicateAwbForStore(
  pb: PocketBase,
  storeId: string,
  storeName: string,
  awbRaw: string,
): Promise<{ orderNo: string; salesOrderId: string } | null> {
  const code = normalizeAwb(awbRaw);
  if (!code || code.length < 3) return null;

  const esc = escapeFilter(code);
  const escUpper = escapeFilter(code.toUpperCase());

  const filters = [
    `(wms_booking_no = "${esc}" || wms_booking_no = "${escUpper}") && status != "cancelled"`,
    `notes ~ "AWB: ${esc}" && status != "cancelled"`,
    `notes ~ "Nomor lacak: ${esc}" && status != "cancelled"`,
  ];

  const seen = new Set<string>();

  for (const filter of filters) {
    let page = 1;
    for (;;) {
      const batch = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(page, 50, {
        filter,
        fields: "id,order_no,notes,wms_booking_no,outbound_workflow_json,status",
        sort: "-created",
        requestKey: null,
      });
      for (const so of batch.items) {
        if (seen.has(so.id)) continue;
        seen.add(so.id);
        if (!orderBelongsToStore(so, storeId, storeName)) continue;
        if (awbOnOrder(so) === code) {
          return { orderNo: so.order_no, salesOrderId: so.id };
        }
      }
      if (batch.page >= batch.totalPages) break;
      page += 1;
    }
  }

  return null;
}

export async function assertAwbUniqueForStore(
  pb: PocketBase,
  storeId: string,
  storeName: string,
  awbRaw: string,
): Promise<void> {
  const dup = await findDuplicateAwbForStore(pb, storeId, storeName, awbRaw);
  if (dup) {
    throw new Error(
      `No. AWB "${normalizeAwb(awbRaw)}" sudah dipakai di toko ini (order ${dup.orderNo}). Gunakan nomor lain.`,
    );
  }
}
