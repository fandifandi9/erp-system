import { pb } from "@/lib/pocketbase";

export type ProductHit = {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
};

export type BalanceHit = {
  id: string;
  warehouse: string;
  product: string;
  qty_on_hand: number;
  qty_available: number;
  expand?: {
    warehouse?: { code?: string; name?: string };
    product?: ProductHit;
  };
};

export async function findProductByBarcode(barcode: string): Promise<ProductHit | null> {
  const esc = barcode.trim().replace(/"/g, '\\"');
  if (!esc) return null;

  try {
    const primary = await pb.collection("inv_products").getList(1, 1, {
      filter: `barcode = "${esc}" && is_active = true`,
    });
    if (primary.items[0]) return primary.items[0] as unknown as ProductHit;
  } catch {
    /* */
  }

  try {
    const alt = await pb.collection("inv_product_barcodes").getList(1, 1, {
      filter: `barcode = "${esc}"`,
      expand: "product",
    });
    const row = alt.items[0] as { expand?: { product?: ProductHit } };
    if (row?.expand?.product) return row.expand.product;
  } catch {
    /* collection optional */
  }

  try {
    const sku = await pb.collection("inv_products").getList(1, 1, {
      filter: `sku = "${esc}" && is_active = true`,
    });
    if (sku.items[0]) return sku.items[0] as unknown as ProductHit;
  } catch {
    /* */
  }

  return null;
}

export async function fetchBalancesForProduct(productId: string): Promise<BalanceHit[]> {
  const res = await pb.collection("inv_stock_balances").getList(1, 50, {
    filter: `product = "${productId}"`,
    sort: "-qty_on_hand",
    expand: "warehouse,product",
  });
  return res.items as unknown as BalanceHit[];
}
