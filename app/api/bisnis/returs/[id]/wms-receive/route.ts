import { NextResponse } from "next/server";
import { requirePenjualanOrWmsApiUser } from "@/lib/bisnis/api-auth";
import {
  markSalesReturnWmsProcessStarted,
  receiveSalesReturnAtWms,
} from "@/lib/wms/sales-return-receive";
import { preparePurchaseReturnAtWms } from "@/lib/bisnis/purchase-retur-create";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePenjualanOrWmsApiUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      action?: "start" | "receive";
      unboxing_video_path?: string;
      received_lines?: {
        line_id?: string;
        product: string;
        qty: number;
        condition?: "good" | "damaged";
      }[];
      wms_note?: string;
      claim_decision?: "agree" | "disagree";
      dispute_note?: string;
    };

    const adminPb = await getInventoryAdminPb();
    const retur = await adminPb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(id);

    if (body.action === "start") {
      const updated = await markSalesReturnWmsProcessStarted(adminPb, id, auth.userId);
      return NextResponse.json({ ok: true, data: updated });
    }

    if (retur.type === "penjualan") {
      if (body.claim_decision !== "agree" && body.claim_decision !== "disagree") {
        return NextResponse.json(
          { error: "claim_decision wajib: agree atau disagree" },
          { status: 400 },
        );
      }
      const updated = await receiveSalesReturnAtWms(adminPb, {
        returId: id,
        userId: auth.userId,
        unboxing_video_path: body.unboxing_video_path,
        received_lines: body.received_lines,
        wms_note: body.wms_note,
        claim_decision: body.claim_decision,
        dispute_note: body.dispute_note,
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

    return NextResponse.json({ error: "Jenis retur tidak didukung" }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal proses penerimaan WMS" },
      { status: 400 },
    );
  }
}
