import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { getProductStockOverviewServer } from "@/lib/catalog/product-stock-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireCatalogAccess(req);
    const { id } = await ctx.params;
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    const overview = await getProductStockOverviewServer(id, fresh);
    return NextResponse.json({ ok: true, overview });
  } catch (err) {
    return jsonError(err, "Gagal memuat stok produk.");
  }
}
