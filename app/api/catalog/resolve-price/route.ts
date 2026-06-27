import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { getCatalogPb } from "@/lib/catalog/api-server";
import { resolveSellPrice, resolveSellPricesForProducts } from "@/lib/catalog/product-price";

export async function GET(req: Request) {
  try {
    await requireCatalogAccess(req);
    const url = new URL(req.url);
    const productId = url.searchParams.get("product")?.trim() ?? "";
    const storeId = url.searchParams.get("store")?.trim() ?? "";
    if (!productId) {
      return NextResponse.json({ ok: false, error: "Produk wajib." }, { status: 400 });
    }
    const pb = await getCatalogPb();
    const resolved = await resolveSellPrice(pb, productId, storeId || undefined);
    return NextResponse.json({ ok: true, ...resolved });
  } catch (err) {
    return jsonError(err, "Gagal menghitung harga.");
  }
}

export async function POST(req: Request) {
  try {
    await requireCatalogAccess(req);
    const body = (await req.json()) as { productIds?: string[]; storeId?: string };
    const productIds = body.productIds ?? [];
    const storeId = body.storeId?.trim() || undefined;
    if (productIds.length === 0) {
      return NextResponse.json({ ok: true, prices: {} });
    }
    const pb = await getCatalogPb();
    const map = await resolveSellPricesForProducts(pb, productIds, storeId);
    const prices: Record<string, { sellPrice: number; source: string }> = {};
    map.forEach((v, k) => {
      prices[k] = { sellPrice: v.sellPrice, source: v.source };
    });
    return NextResponse.json({ ok: true, prices });
  } catch (err) {
    return jsonError(err, "Gagal menghitung harga.");
  }
}
