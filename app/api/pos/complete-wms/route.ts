import { NextResponse } from "next/server";
import { requirePosApiUser } from "@/lib/pos/api-auth";
import { completeWmsPosSale } from "@/lib/pos/complete-wms";
import type { PosCart, PosCheckoutWms, PosSession } from "@/lib/pos/types";

type Body = {
  session?: PosSession;
  cart?: PosCart;
  checkout?: PosCheckoutWms;
};

export async function POST(req: Request) {
  try {
    const ctx = await requirePosApiUser(req);
    const body = (await req.json()) as Body;
    if (!body.session?.warehouseId || !body.session.channelAccountId) {
      return NextResponse.json({ error: "Sesi POS WMS tidak lengkap" }, { status: 400 });
    }
    if (body.session.mode !== "wms") {
      return NextResponse.json({ error: "Mode POS bukan marketplace/WMS" }, { status: 400 });
    }
    if (!body.cart?.lines?.length) {
      return NextResponse.json({ error: "Keranjang kosong" }, { status: 400 });
    }
    const c = body.checkout;
    if (!c) {
      return NextResponse.json({ error: "Data pengiriman tidak lengkap" }, { status: 400 });
    }

    const result = await completeWmsPosSale({
      session: body.session,
      cart: body.cart,
      checkout: c,
      userId: ctx.userId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    const raw = e instanceof Error ? e.message : err.message ?? "Gagal menyimpan pesanan WMS";
    const error =
      status === 404 || /wasn't found/i.test(raw)
        ? "Data tidak ditemukan di server (cek akun MP, gudang, atau produk). Hubungi admin jika berulang."
        : raw;
    return NextResponse.json({ error }, { status: status === 404 ? 500 : status });
  }
}
