import { NextResponse } from "next/server";
import { requirePosApiUser } from "@/lib/pos/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  mapProductsToPosHits,
  resolvePosProductByScan,
} from "@/lib/pos/product-search";

/** Lookup exact barcode / SKU untuk scanner POS (tanpa debounce). */
export async function GET(req: Request) {
  try {
    await requirePosApiUser(req);
    const url = new URL(req.url);
    const code = url.searchParams.get("code")?.trim() ?? "";
    const warehouseId = url.searchParams.get("warehouse")?.trim() ?? "";
    const storeId = url.searchParams.get("store")?.trim() ?? "";

    if (!code) {
      return NextResponse.json({ error: "Kode scan kosong" }, { status: 400 });
    }

    const adminPb = await getInventoryAdminPb();
    const product = await resolvePosProductByScan(adminPb, code);
    if (!product) {
      return NextResponse.json(
        { error: `Produk tidak ditemukan untuk kode: ${code}` },
        { status: 404 },
      );
    }

    const [item] = await mapProductsToPosHits(adminPb, [product], {
      warehouseId,
      storeId,
    });

    return NextResponse.json({ item });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal scan produk" },
      { status },
    );
  }
}
