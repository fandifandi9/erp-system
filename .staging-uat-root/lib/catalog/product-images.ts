import type { InvProduct } from "@/lib/inventory/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { pb } from "@/lib/pocketbase";

export const PRODUCT_IMAGE_FIELDS = ["image", "image_2", "image_3"] as const;
export type ProductImageField = (typeof PRODUCT_IMAGE_FIELDS)[number];
export const MAX_PRODUCT_IMAGES = PRODUCT_IMAGE_FIELDS.length;

export const PRODUCT_IMAGE_ACCEPT = "image/webp,image/jpeg,image/png,image/gif";

export async function convertImageToWebp(file: File): Promise<File> {
  if (file.type === "image/webp") return file;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.85);
    });
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "product";
    return new File([blob], `${base}.webp`, { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}

export function getProductImageUrl(
  product: InvProduct,
  field: ProductImageField = "image",
  thumb?: string,
): string | null {
  const filename = product[field];
  if (!filename || typeof filename !== "string") return null;
  const record = {
    id: product.id,
    collectionId: product.collectionId || "",
    collectionName: INV_COLLECTIONS.products,
  };
  return thumb ? pb.files.getURL(record, filename, { thumb }) : pb.files.getURL(record, filename);
}

export function getProductImageUrls(product: InvProduct, thumb?: string): string[] {
  return PRODUCT_IMAGE_FIELDS.map((field) => getProductImageUrl(product, field, thumb)).filter(
    (url): url is string => !!url,
  );
}

export function hasProductImageUploads(formData: FormData): boolean {
  return PRODUCT_IMAGE_FIELDS.some((field) => {
    const value = formData.get(field);
    return value instanceof File && value.size > 0;
  });
}

export function hasProductImageChanges(formData: FormData): boolean {
  return PRODUCT_IMAGE_FIELDS.some((field) => {
    const value = formData.get(field);
    return (value instanceof File && value.size > 0) || value === "";
  });
}

export function appendProductImagesToFormData(fd: FormData, source: FormData): void {
  for (const field of PRODUCT_IMAGE_FIELDS) {
    const value = source.get(field);
    if (value instanceof File && value.size > 0) {
      fd.append(field, value);
      continue;
    }
    if (value === "") {
      fd.append(field, "");
    }
  }
}
