import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { getProductsStockTotalsServer } from "@/lib/catalog/product-stock-server";
import { getProductsLastSaleServer } from "@/lib/catalog/product-last-sale-server";

export async function POST(req: Request) {
  try {
    await requireCatalogAccess(req);
    const body = (await req.json()) as { productIds?: string[] };
    const productIds = (body.productIds ?? []).filter(Boolean).slice(0, 200);

    const [totals, lastSales] = await Promise.all([
      getProductsStockTotalsServer(productIds),
      getProductsLastSaleServer(productIds),
    ]);

    return NextResponse.json({
      ok: true,
      global: totals.global,
      sellable: totals.sellable,
      lastSales,
    });
  } catch (err) {
    return jsonError(err, "Gagal memuat meta stok katalog.");
  }
}
