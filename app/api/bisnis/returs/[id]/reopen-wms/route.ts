import { NextResponse } from "next/server";
import { requirePenjualanOrWmsApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";

/** Setelah bisnis tanggapi sanggahan claim — buka lagi antrean WMS. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePenjualanOrWmsApiUser(_req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const retur = await adminPb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(id);

    if (retur.type !== "penjualan") {
      return NextResponse.json({ error: "Hanya retur penjualan" }, { status: 400 });
    }
    if (retur.status === "completed" || retur.status === "cancelled") {
      return NextResponse.json({ error: "Retur sudah selesai/dibatalkan" }, { status: 400 });
    }
    if (retur.wms_receive_status === "complete") {
      return NextResponse.json({ error: "Retur sudah diterima WMS" }, { status: 400 });
    }

    const updated = await adminPb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(id, {
      workflow_phase: "awaiting_wms",
      wms_receive_status: "pending",
      exception_status: "none",
      wms_exception_summary: "",
      reminder_due_at: "",
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal kirim ulang ke WMS" },
      { status: 400 },
    );
  }
}
