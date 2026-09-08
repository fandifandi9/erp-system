import { NextResponse } from "next/server";
import { requirePenjualanOrWmsApiUser, bisnisApiError } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import {
  getAwbLabelUrl,
  getAwbTrackingFromOrder,
  validateAwbLabelFile,
  type AwbSource,
} from "@/lib/bisnis/awb-label";
import { syncPickupGateForOrder } from "@/lib/wms/sync-pickup-gate";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string; status?: number };
  const raw = e instanceof Error ? e.message : err.message ?? fallback;
  if (/wasn't found|404|collection/i.test(raw)) {
    return "Field awb_label belum ada di PocketBase. Jalankan: node scripts/fix-pb-awb-label-schema.mjs";
  }
  return raw;
}

const VALID_SOURCES: AwbSource[] = ["manual", "excel", "zip_import", "wms_pickup", "system"];

function parseSource(raw: string | null): AwbSource {
  const s = (raw ?? "manual").trim() as AwbSource;
  return VALID_SOURCES.includes(s) ? s : "manual";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requirePenjualanOrWmsApiUser(_req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const so = await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(id);
    const url = getAwbLabelUrl(so);
    return NextResponse.json({
      ok: true,
      has_file: !!so.awb_label,
      url,
      filename: so.awb_label ?? null,
      tracking_no: getAwbTrackingFromOrder(so) || null,
      awb_ready_at: so.awb_ready_at ?? null,
      awb_source: so.awb_source ?? null,
    });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Gagal memuat label AWB") }, { status });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePenjualanOrWmsApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw bisnisApiError("File label AWB wajib diunggah.", 400);
    }
    const msg = validateAwbLabelFile(file);
    if (msg) throw bisnisApiError(msg, 400);

    const source = parseSource(String(form.get("source") ?? "manual"));
    const fd = new FormData();
    fd.set("awb_label", file);
    fd.set("awb_ready_at", new Date().toISOString());
    fd.set("awb_source", source);

    await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).update<SalesOrder>(id, fd);
    const so = (await syncPickupGateForOrder(id, adminPb)) ??
      (await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(id));
    await emitBusinessEventServer(adminPb, {
      event_code: "wms.awb.uploaded",
      module: "warehouse",
      entity_type: "biz_sales_orders",
      entity_id: id,
      entity_label: so.order_no,
      store_id: so.store,
      warehouse_id: so.warehouse,
      payload: { order_no: so.order_no },
      actor_id: auth.userId,
    });
    return NextResponse.json(so);
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Upload label AWB gagal") }, { status });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requirePenjualanOrWmsApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).update(id, {
      awb_label: null,
      awb_ready_at: "",
      awb_source: "",
    });
    await syncPickupGateForOrder(id, adminPb);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Gagal menghapus label AWB") }, { status });
  }
}
