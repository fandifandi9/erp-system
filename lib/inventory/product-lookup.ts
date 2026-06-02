import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { InvProduct } from "@/lib/inventory/types";

export async function findProductByBarcode(
  pb: PocketBase,
  barcode: string
): Promise<InvProduct | null> {
  const esc = barcode.trim().replace(/"/g, '\\"');
  if (!esc) return null;

  try {
    const primary = await pb.collection(INV_COLLECTIONS.products).getList(1, 1, {
      filter: `barcode = "${esc}" && is_active = true`,
    });
    if (primary.items[0]) return primary.items[0] as unknown as InvProduct;
  } catch {
    /* */
  }

  try {
    const alt = await pb.collection(INV_COLLECTIONS.productBarcodes).getList(1, 1, {
      filter: `barcode = "${esc}"`,
      expand: "product",
    });
    const row = alt.items[0] as { expand?: { product?: InvProduct } };
    if (row?.expand?.product?.id) return row.expand.product;
  } catch {
    /* collection optional */
  }

  try {
    const sku = await pb.collection(INV_COLLECTIONS.products).getList(1, 1, {
      filter: `sku = "${esc}" && is_active = true`,
    });
    if (sku.items[0]) return sku.items[0] as unknown as InvProduct;
  } catch {
    /* */
  }

  return null;
}
