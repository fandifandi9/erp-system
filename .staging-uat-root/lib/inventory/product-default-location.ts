import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { INV_COLLECTIONS } from "./types";

/** Set / hapus default_location produk (relasi ke inv_locations). */
export async function setProductDefaultLocationOnPb(
  pb: PocketBase,
  productId: string,
  locationId: string | null,
): Promise<void> {
  try {
    await pb.collection(INV_COLLECTIONS.products).update(productId, {
      default_location: locationId,
    });
    return;
  } catch (firstErr) {
    if (!(firstErr instanceof ClientResponseError) || firstErr.status !== 400) {
      throw firstErr;
    }
  }

  const product = await pb.collection(INV_COLLECTIONS.products).getOne(productId, {
    fields: "id,sku,name,default_location",
  });

  const payload: Record<string, unknown> = {
    sku: product.sku,
    name: product.name,
    default_location: locationId,
  };

  try {
    await pb.collection(INV_COLLECTIONS.products).update(productId, payload);
  } catch (err) {
    if (err instanceof ClientResponseError) {
      const msg = `${err.message} ${JSON.stringify(err.data ?? {})}`.toLowerCase();
      if (msg.includes("default_location") && (msg.includes("unknown") || msg.includes("invalid"))) {
        throw new Error(
          "Field default_location belum ada di collection inv_products di PocketBase. " +
            "Tambahkan Relation → inv_locations (max 1), lalu coba lagi.",
        );
      }
    }
    throw err;
  }
}
