import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getWarehouseStockListServer } from "@/lib/inventory/stock-list-server";

export async function GET(req: Request) {
  try {
    await requireInventoryAccess(req);
    const url = new URL(req.url);
    const warehouseId = url.searchParams.get("warehouse")?.trim() ?? "";
    const page = Number(url.searchParams.get("page") ?? 1);
    const perPage = Number(url.searchParams.get("perPage") ?? 100);
    const q = url.searchParams.get("q") ?? undefined;

    if (!warehouseId) {
      return NextResponse.json({ ok: false, error: "Gudang wajib dipilih." }, { status: 400 });
    }

    const result = await getWarehouseStockListServer({ warehouseId, page, perPage, q });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return jsonError(err, "Gagal memuat stok gudang.");
  }
}
