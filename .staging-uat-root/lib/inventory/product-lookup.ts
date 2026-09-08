import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { InvProduct } from "@/lib/inventory/types";

async function findActiveProduct(
  pb: PocketBase,
  baseFilter: string,
): Promise<InvProduct | null> {
  const attempts = [
    `${baseFilter} && is_active = true`,
    `${baseFilter} && lifecycle_status = "active"`,
    baseFilter,
  ];
  for (const filter of attempts) {
    try {
      const res = await pb.collection(INV_COLLECTIONS.products).getList(1, 1, { filter });
      if (res.items[0]) return res.items[0] as unknown as InvProduct;
    } catch {
      /* coba filter berikutnya */
    }
  }
  return null;
}

export async function findProductByBarcode(
  pb: PocketBase,
  barcode: string
): Promise<InvProduct | null> {
  const esc = barcode.trim().replace(/"/g, '\\"');
  if (!esc) return null;

  const byBarcode = await findActiveProduct(pb, `barcode = "${esc}"`);
  if (byBarcode) return byBarcode;

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

  const bySku = await findActiveProduct(pb, `sku = "${esc}"`);
  if (bySku) return bySku;

  return null;
}
