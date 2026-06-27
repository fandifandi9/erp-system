import type { SalesOrder } from "@/lib/bisnis/types";
import { extractAwbFromOrder } from "@/lib/wms/package-identity";
import { getPkFromSo } from "@/lib/wms/pk-identity";
import { normalizeAwb } from "@/lib/pos/awb-unique";
import { parsePosNotes } from "@/lib/pos/meta";

export type PosPickupInfo = {
  pickupNo: string;
  pickupType: "awb" | "internal";
};

/**
 * Satu sumber nomor pickup POS/WMS:
 * - AWB/resi jika kirim ekspedisi
 * - selain itu kode pickup (pk_no) — acak jika SO otomatis, atau nomor pesanan MP jika diisi manual
 */
export function resolvePosPickupNo(
  so: Pick<SalesOrder, "order_no" | "pk_no" | "outbound_workflow_json" | "notes">,
): PosPickupInfo {
  const meta = parsePosNotes(so.notes);
  const awbRaw =
    meta?.shipping?.awb?.trim() ||
    extractAwbFromOrder(so) ||
    "";
  const awb = normalizeAwb(awbRaw);
  if (awb) return { pickupNo: awb, pickupType: "awb" };

  const pk =
    getPkFromSo(so)?.trim() ||
    meta?.pickup_code?.trim() ||
    so.order_no?.trim() ||
    "";
  return { pickupNo: pk, pickupType: "internal" };
}
