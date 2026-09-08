import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import {
  acceptWmsClarification,
  rejectReturForResend,
} from "@/lib/bisnis/sales-retur-resolve";
import type { ResendShippingInfo } from "@/lib/bisnis/sales-retur-resend-shipping";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const auth = await requirePenjualanApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      action?: "accept_wms" | "resend";
      method?: "pickup" | "ship";
      shipping?: Partial<ResendShippingInfo>;
    };
    const adminPb = await getInventoryAdminPb();
    const retur = await adminPb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(id);
    if (retur.type !== "penjualan") {
      return NextResponse.json({ ok: false, error: "Hanya retur penjualan." }, { status: 400 });
    }

    if (body.action === "accept_wms") {
      const updated = await acceptWmsClarification(adminPb, id, auth.userId);
      return NextResponse.json({ ok: true, data: { retur: updated } });
    }
    if (body.action === "resend") {
      const updated = await rejectReturForResend(adminPb, id, auth.userId, {
        method: body.method,
        shipping: body.shipping,
      });
      return NextResponse.json({ ok: true, data: { retur: updated } });
    }
    return NextResponse.json(
      { ok: false, error: "action wajib: accept_wms | resend" },
      { status: 400 },
    );
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : err.message ?? "Gagal putusan retur" },
      { status },
    );
  }
}
