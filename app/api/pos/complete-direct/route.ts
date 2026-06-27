import { NextResponse } from "next/server";
import { ClientResponseError } from "pocketbase";
import { requirePosApiUser } from "@/lib/pos/api-auth";
import { completeDirectPosSale } from "@/lib/pos/complete-direct";
import { getErrorMessage } from "@/lib/errors";
import type { PosCart, PosCheckoutDirect, PosSession } from "@/lib/pos/types";

type Body = {
  session?: PosSession;
  cart?: PosCart;
  checkout?: PosCheckoutDirect;
};

export async function POST(req: Request) {
  try {
    const ctx = await requirePosApiUser(req);
    const body = (await req.json()) as Body;
    if (!body.session?.warehouseId) {
      return NextResponse.json({ error: "Sesi POS tidak valid" }, { status: 400 });
    }
    if (body.session.mode !== "direct") {
      return NextResponse.json({ error: "Mode POS bukan penjualan langsung" }, { status: 400 });
    }
    if (!body.cart?.lines?.length) {
      return NextResponse.json({ error: "Keranjang kosong" }, { status: 400 });
    }
    if (!body.checkout?.paymentMethodId?.trim()) {
      return NextResponse.json({ error: "Pilih metode pembayaran" }, { status: 400 });
    }

    const result = await completeDirectPosSale({
      session: body.session,
      cart: body.cart,
      checkout: {
        ...body.checkout,
        buyerName: body.checkout.buyerName?.trim() || "Pelanggan Umum",
        buyerPhone: body.checkout.buyerPhone?.trim() ?? "",
      },
      userId: ctx.userId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const status =
      e instanceof ClientResponseError && e.status >= 400 ? e.status : 500;
    return NextResponse.json(
      { error: getErrorMessage(e, "Gagal menyimpan transaksi POS") },
      { status },
    );
  }
}
