import { NextResponse } from "next/server";
import { requirePosApiUser } from "@/lib/pos/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { searchPosProducts } from "@/lib/pos/product-search";

export async function GET(req: Request) {
  try {
    await requirePosApiUser(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const warehouseId = url.searchParams.get("warehouse")?.trim() ?? "";
    const storeId = url.searchParams.get("store")?.trim() ?? "";
    if (!q || q.length < 1) {
      return NextResponse.json({ items: [] });
    }

    const adminPb = await getInventoryAdminPb();
    const items = await searchPosProducts(adminPb, q, { warehouseId, storeId });

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal mencari produk" },
      { status },
    );
  }
}
