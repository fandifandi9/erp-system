import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { canEditCatalogPrices } from "@/lib/catalog/catalog-access";
import { getCatalogPb } from "@/lib/catalog/api-server";
import { listStorePricesForStore, upsertStoreProductPrice } from "@/lib/catalog/product-price";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

/** Daftar harga per toko — filter store + optional q (sku/nama). */
export async function GET(req: Request) {
  try {
    await requireCatalogAccess(req);
    const url = new URL(req.url);
    const storeId = url.searchParams.get("store")?.trim() ?? "";
    const q = url.searchParams.get("q")?.trim() ?? "";
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "Toko wajib dipilih." }, { status: 400 });
    }

    const pb = await getCatalogPb();
    let productIds: string[] | undefined;
    if (q) {
      const esc = q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const products = await pb.collection(INV_COLLECTIONS.products).getList(1, 80, {
        filter: `(sku ~ "${esc}" || name ~ "${esc}" || barcode ~ "${esc}")`,
        fields: "id",
        sort: "name",
      });
      productIds = products.items.map((p) => p.id);
      if (productIds.length === 0) {
        return NextResponse.json({ ok: true, items: [], products: [] });
      }
    }

    const priceRows = await listStorePricesForStore(pb, storeId, { productIds });
    const priceByProduct = new Map(priceRows.map((r) => [r.product, r]));

    let products: { id: string; sku: string; name: string; sell_price?: number; product_type?: string }[] =
      [];
    if (q && productIds) {
      const filter = productIds.map((id) => `id = "${id.replace(/"/g, '\\"')}"`).join(" || ");
      products = await pb.collection(INV_COLLECTIONS.products).getFullList({
        filter,
        fields: "id,sku,name,sell_price,product_type,lifecycle_status",
        sort: "name",
        requestKey: null,
      });
    }

    return NextResponse.json({
      ok: true,
      items: priceRows,
      priceByProduct: Object.fromEntries(priceByProduct),
      products,
    });
  } catch (err) {
    return jsonError(err, "Gagal memuat harga toko.");
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireCatalogAccess(req);
    if (!canEditCatalogPrices(auth.user)) {
      return NextResponse.json({ ok: false, error: "Tidak boleh mengubah harga." }, { status: 403 });
    }
    const body = (await req.json()) as {
      productId?: string;
      storeId?: string;
      sellPrice?: number;
    };
    if (!body.productId || !body.storeId) {
      return NextResponse.json({ ok: false, error: "Produk dan toko wajib." }, { status: 400 });
    }
    const pb = await getCatalogPb();
    const row = await upsertStoreProductPrice(pb, {
      productId: body.productId,
      storeId: body.storeId,
      sellPrice: Number(body.sellPrice) || 0,
    });
    return NextResponse.json({ ok: true, item: row });
  } catch (err) {
    return jsonError(err, "Gagal menyimpan harga.");
  }
}
