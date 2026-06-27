import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { getCatalogPb } from "@/lib/catalog/api-server";
import { computeBundleAvailableQty } from "@/lib/catalog/bundle-expand";
import { fetchBundleLines } from "@/lib/catalog/bundle-lines";
import { fetchStockMapByWarehouse } from "@/lib/inventory/stock-balances";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { CatalogProduct } from "@/lib/catalog/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireCatalogAccess(req);
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const warehouseId = url.searchParams.get("warehouse")?.trim() ?? "";

    const pb = await getCatalogPb();
    const product = await pb.collection(INV_COLLECTIONS.products).getOne<CatalogProduct>(id);

    if ((product.product_type ?? "simple") === "bundle") {
      const lines = await fetchBundleLines(pb, id);
      const available = warehouseId
        ? await computeBundleAvailableQty(pb, id, warehouseId)
        : 0;
      return NextResponse.json({
        ok: true,
        product_type: "bundle",
        available,
        warehouse_id: warehouseId || null,
        component_count: lines.filter((l) => l.is_active !== false).length,
      });
    }

    let available = 0;
    if (warehouseId) {
      const stockMap = await fetchStockMapByWarehouse(warehouseId);
      available = stockMap[id] ?? 0;
    }

    return NextResponse.json({
      ok: true,
      product_type: "simple",
      available,
      warehouse_id: warehouseId || null,
    });
  } catch (err) {
    return jsonError(err, "Gagal menghitung ketersediaan.");
  }
}
