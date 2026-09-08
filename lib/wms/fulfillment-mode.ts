import { parseNotesWithShipping, type ShippingInfo } from "@/lib/bisnis/shipping-notes";
import type { SalesOrder } from "@/lib/bisnis/types";

/** Mode fulfillment WMS — ditentukan ada/tidaknya info pengiriman (bukan toggle). */
export type WmsFulfillmentMode = "ship" | "pickup";

/**
 * Ada rute kirim sungguhan: kurir / layanan / alamat.
 * Tracking/resi saja (atau flag enabled tanpa isi) tidak cukup — itu sering polusi
 * dari generate label AWB lama yang memakai nomor PK sebagai resi.
 */
export function hasWmsShippingRoute(shipping: ShippingInfo): boolean {
  return !!(
    shipping.courier.trim() ||
    shipping.shipping_service.trim() ||
    shipping.recipient_address.trim()
  );
}

/**
 * Dikirim = ada kurir / layanan / alamat pengiriman.
 * Ambil sendiri = tanpa data rute tersebut (termasuk SO lama & order yang hanya punya tracking/PK).
 */
export function getWmsFulfillmentMode(
  notesOrSo?: string | null | Pick<SalesOrder, "notes">,
): WmsFulfillmentMode {
  const notes =
    typeof notesOrSo === "string" || notesOrSo == null
      ? notesOrSo
      : notesOrSo.notes;
  const { shipping } = parseNotesWithShipping(notes ?? "");
  return hasWmsShippingRoute(shipping) ? "ship" : "pickup";
}

export function isWmsPickupFulfillment(
  notesOrSo?: string | null | Pick<SalesOrder, "notes">,
): boolean {
  return getWmsFulfillmentMode(notesOrSo) === "pickup";
}

export function isWmsShipFulfillment(
  notesOrSo?: string | null | Pick<SalesOrder, "notes">,
): boolean {
  return getWmsFulfillmentMode(notesOrSo) === "ship";
}
