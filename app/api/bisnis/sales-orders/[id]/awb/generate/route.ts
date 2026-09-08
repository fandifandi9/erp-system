import { NextResponse } from "next/server";
import { requirePenjualanOrWmsApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import {
  getAwbLabelUrl,
  getAwbTrackingFromOrder,
  hasAwbLabelFile,
} from "@/lib/bisnis/awb-label";
import { ensureAwbLabelForSalesOrder } from "@/lib/bisnis/awb-label-generate";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string };
  return e instanceof Error ? e.message : err.message ?? fallback;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePenjualanOrWmsApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    const force = body.force === true;

    const before = await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(id);
    const hadFile = hasAwbLabelFile(before);

    // Default: jangan regenerate jika file sudah ada (cepat, stabil di packing).
    // force=true hanya untuk tombol "buat ulang" eksplisit.
    const so = await ensureAwbLabelForSalesOrder(adminPb, id, { force });
    const created = !hadFile && hasAwbLabelFile(so);

    if (created || (force && hasAwbLabelFile(so))) {
      await emitBusinessEventServer(adminPb, {
        event_code: "wms.awb.generated",
        module: "warehouse",
        entity_type: "biz_sales_orders",
        entity_id: id,
        entity_label: so.order_no,
        store_id: so.store,
        warehouse_id: so.warehouse,
        payload: {
          order_no: so.order_no,
          tracking_no: getAwbTrackingFromOrder(so),
          force,
        },
        actor_id: auth.userId,
      });
    }

    return NextResponse.json({
      ok: true,
      created,
      has_file: hasAwbLabelFile(so),
      url: getAwbLabelUrl(so),
      filename: so.awb_label ?? null,
      tracking_no: getAwbTrackingFromOrder(so) || null,
      awb_ready_at: so.awb_ready_at ?? null,
      awb_source: so.awb_source ?? null,
    });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: pbErrorMessage(e, "Gagal membuat label AWB") },
      { status },
    );
  }
}
