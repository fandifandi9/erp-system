import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { calculateSkuFees } from "@/lib/bisnis/mp-sku-fee-server";
import { mpFeeError } from "../respond";

/**
 * Hitung fee MP + affiliate per SKU untuk daftar baris transaksi.
 * Body: { tier: string, lines: [{ product, gross, qty? }] }
 * Hasil dipakai untuk preview & snapshot ke mp_fees_json saat posting.
 */
export async function POST(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const body = (await req.json()) as {
      tier?: string;
      lines?: { product?: string; gross?: number; qty?: number }[];
    };
    if (!body.tier?.trim()) {
      return NextResponse.json({ ok: false, error: "Tier wajib diisi." }, { status: 400 });
    }
    const lines = (body.lines ?? [])
      .filter((l) => l.product?.trim())
      .map((l) => ({ product: l.product!.trim(), gross: Number(l.gross) || 0, qty: Number(l.qty) || 1 }));
    if (lines.length === 0) {
      return NextResponse.json({ ok: false, error: "Minimal satu baris produk." }, { status: 400 });
    }
    const pb = await getInventoryAdminPb();
    const result = await calculateSkuFees(pb, { tierId: body.tier.trim(), lines });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return mpFeeError(e, "Gagal menghitung fee.");
  }
}
