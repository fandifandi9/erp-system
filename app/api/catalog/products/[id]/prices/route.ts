import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { canEditCatalogPrices } from "@/lib/catalog/catalog-access";
import { getCatalogPb } from "@/lib/catalog/api-server";
import {
  deleteStoreProductPrice,
  listStorePricesForProduct,
  upsertStoreProductPrice,
} from "@/lib/catalog/product-price";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireCatalogAccess(req);
    const { id } = await ctx.params;
    const pb = await getCatalogPb();
    const rows = await listStorePricesForProduct(pb, id);
    return NextResponse.json({ ok: true, items: rows });
  } catch (err) {
    return jsonError(err, "Gagal memuat harga per toko.");
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const auth = await requireCatalogAccess(req);
    if (!canEditCatalogPrices(auth.user)) {
      return NextResponse.json({ ok: false, error: "Tidak boleh mengubah harga." }, { status: 403 });
    }
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      storeId?: string;
      sellPrice?: number;
      deletePriceId?: string;
    };
    const pb = await getCatalogPb();

    if (body.deletePriceId) {
      await deleteStoreProductPrice(pb, body.deletePriceId);
      return NextResponse.json({ ok: true });
    }

    if (!body.storeId?.trim()) {
      return NextResponse.json({ ok: false, error: "Toko wajib dipilih." }, { status: 400 });
    }
    const row = await upsertStoreProductPrice(pb, {
      productId: id,
      storeId: body.storeId.trim(),
      sellPrice: Number(body.sellPrice) || 0,
    });
    return NextResponse.json({ ok: true, item: row });
  } catch (err) {
    return jsonError(err, "Gagal menyimpan harga.");
  }
}
