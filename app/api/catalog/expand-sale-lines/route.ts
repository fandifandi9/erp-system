import { NextResponse } from "next/server";
import { bisnisApiError, requirePenjualanOrWmsApiUser } from "@/lib/bisnis/api-auth";
import { resolveMovementLinesFromSale } from "@/lib/catalog/sale-stock-lines";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";

type Body = {
  lines?: { product: string; qty: number; sales_order_line_id?: string }[];
};

/**
 * Expand baris penjualan → komponen fisik (bundle) memakai admin PB.
 * Koleksi inv_product_bundle_lines sering admin-only — jangan expand dari browser.
 */
export async function POST(req: Request) {
  try {
    await requirePenjualanOrWmsApiUser(req);
    const body = (await req.json()) as Body;
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) {
      return NextResponse.json({ ok: true, lines: [] });
    }
    for (const l of lines) {
      if (!l?.product || !(Number(l.qty) > 0)) {
        throw bisnisApiError("Setiap baris wajib product + qty > 0.", 400);
      }
    }

    const adminPb = await getInventoryAdminPb();
    const expanded = await resolveMovementLinesFromSale(adminPb, lines);
    return NextResponse.json({ ok: true, lines: expanded });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err && typeof (err as { status: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
    const message = err instanceof Error ? err.message : "Gagal expand baris stok.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
