import { NextResponse } from "next/server";
import { requirePenjualanOrWmsApiUser } from "@/lib/bisnis/api-auth";
import { receiveSalesReturnAtWms } from "@/lib/wms/sales-return-receive";
import { preparePurchaseReturnAtWms } from "@/lib/bisnis/purchase-retur-create";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePenjualanOrWmsApiUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      unboxing_video_path?: string;
      received_lines?: {
        line_id?: string;
        product: string;
        qty: number;
        condition?: "good" | "damaged";
      }[];
      wms_note?: string;
    };

    const adminPb = await getInventoryAdminPb();
    const retur = await adminPb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(id);

    if (retur.type === "penjualan") {
      const updated = await receiveSalesReturnAtWms(adminPb, {
        returId: id,
        userId: auth.userId,
        unboxing_video_path: body.unboxing_video_path,
        received_lines: body.received_lines,
        wms_note: body.wms_note,
      });
      return NextResponse.json({ ok: true, data: updated });
    }

    if (retur.type === "pembelian") {
      const updated = await preparePurchaseReturnAtWms(adminPb, id, auth.userId, {
        unboxing_video_path: body.unboxing_video_path,
        wms_note: body.wms_note,
      });
      return NextResponse.json({ ok: true, data: updated });
    }

    return NextResponse.json({ ok: false, error: "Tipe retur tidak dikenal" }, { status: 400 });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    const message = e instanceof Error ? e.message : "Gagal konfirmasi WMS retur";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
