import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "./types";
import { parseNotesWithShipping } from "./shipping-notes";

export type AwbSource = "manual" | "excel" | "zip_import" | "wms_pickup";

export const AWB_LABEL_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const AWB_LABEL_MAX_BYTES = 8 * 1024 * 1024;

type AwbSoRecord = Pick<SalesOrder, "id" | "awb_label" | "awb_ready_at" | "awb_source" | "notes"> & {
  collectionId?: string;
  collectionName?: string;
};

export function normalizeAwbFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .trim()
    .toLowerCase();
}

export function getAwbLabelUrl(so: AwbSoRecord | null | undefined): string | null {
  if (!so?.awb_label) return null;
  return pb.files.getURL(
    {
      id: so.id,
      collectionId: so.collectionId ?? BISNIS_COLLECTIONS.salesOrders,
      collectionName: so.collectionName ?? "biz_sales_orders",
    },
    so.awb_label,
  );
}

export function hasAwbLabelFile(so: Pick<SalesOrder, "awb_label"> | null | undefined): boolean {
  return !!so?.awb_label?.trim();
}

export function getAwbTrackingFromOrder(so: Pick<SalesOrder, "notes">): string {
  const { shipping } = parseNotesWithShipping(so.notes);
  return shipping.tracking_no?.trim() ?? "";
}

/** Label PDF/gambar tersedia untuk cetak di gudang. */
export function isAwbLabelReady(so: Pick<SalesOrder, "awb_label" | "awb_ready_at"> | null | undefined): boolean {
  return hasAwbLabelFile(so) && !!so?.awb_ready_at?.trim();
}

export function awbSourceLabel(source?: AwbSource | string | null): string {
  switch (source) {
    case "manual":
      return "Upload manual";
    case "excel":
      return "Import Excel (resi)";
    case "zip_import":
      return "ZIP batch import";
    case "wms_pickup":
      return "Gudang (Ready Pickup)";
    default:
      return "—";
  }
}

export function validateAwbLabelFile(file: File): string | null {
  if (!file.size) return "File kosong.";
  if (file.size > AWB_LABEL_MAX_BYTES) return "Ukuran maksimal 8 MB.";
  const mime = file.type || "application/octet-stream";
  const okMime =
    AWB_LABEL_MIME.includes(mime as (typeof AWB_LABEL_MIME)[number]) ||
    /\.pdf$/i.test(file.name) ||
    /\.(png|jpe?g|webp)$/i.test(file.name);
  if (!okMime) return "Format harus PDF atau gambar (PNG/JPG/WebP).";
  return null;
}
