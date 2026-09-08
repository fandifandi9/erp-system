import { NextResponse } from "next/server";
import { requirePenjualanOrWmsApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { notifyPkReadyForSalesOrder } from "@/lib/wms/notify-pk-ready";
import { getErrorMessage } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

/** POST — kirim / kirim ulang email nomor PK (ambil sendiri). */
export async function POST(req: Request, ctx: Ctx) {
  try {
    await requirePenjualanOrWmsApiUser(req);
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "id wajib" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { forceResend?: boolean };
    const pb = await getInventoryAdminPb();
    const result = await notifyPkReadyForSalesOrder(pb, id, {
      forceResend: body.forceResend !== false,
      req,
    });
    if (!result.sent && !result.skipped) {
      return NextResponse.json(
        { ok: false, error: result.reason ?? "Gagal kirim email PK", ...result },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
