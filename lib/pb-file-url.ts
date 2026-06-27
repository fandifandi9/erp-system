import { pb } from "@/lib/pocketbase";

/** URL file PocketBase untuk field file di record. */
export function pbRecordFileUrl(
  collectionIdOrName: string,
  recordId: string,
  filename: string,
): string {
  const base = pb.baseUrl.replace(/\/$/, "");
  return `${base}/api/files/${collectionIdOrName}/${recordId}/${encodeURIComponent(filename)}`;
}

export function productImageUrl(
  productId: string,
  image?: string | null,
  collectionId = "inv_products",
): string | null {
  if (!image?.trim()) return null;
  return pbRecordFileUrl(collectionId, productId, image.trim());
}
