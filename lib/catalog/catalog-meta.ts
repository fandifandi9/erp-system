import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

/** Timestamp perubahan data katalog — tidak di-touch oleh mutasi stok / harga modal otomatis. */
export function catalogUpdatedAtPatch(now = new Date()): { catalog_updated_at: string } {
  return { catalog_updated_at: now.toISOString() };
}

export async function touchCatalogProductUpdatedAt(
  pb: PocketBase,
  productId: string,
): Promise<void> {
  try {
    await pb.collection(INV_COLLECTIONS.products).update(productId, catalogUpdatedAtPatch());
  } catch {
    /* field belum dimigrasi — abaikan */
  }
}

export function resolveCatalogUpdatedAt(product: {
  catalog_updated_at?: string;
  created?: string;
  updated?: string;
}): string | undefined {
  return product.catalog_updated_at ?? product.created;
}
