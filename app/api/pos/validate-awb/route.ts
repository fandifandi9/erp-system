import { NextResponse } from "next/server";
import { requirePosApiUser } from "@/lib/pos/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { findDuplicateAwbForStore, normalizeAwb } from "@/lib/pos/awb-unique";

export async function GET(req: Request) {
  try {
    await requirePosApiUser(req);
    const url = new URL(req.url);
    const awb = url.searchParams.get("awb")?.trim() ?? "";
    const storeId = url.searchParams.get("store")?.trim() ?? "";
    const storeName = url.searchParams.get("storeName")?.trim() ?? "";

    if (!storeId) {
      return NextResponse.json({ error: "Parameter store wajib" }, { status: 400 });
    }

    const normalized = normalizeAwb(awb);
    if (!normalized) {
      return NextResponse.json({ ok: true, unique: true, skipped: true });
    }
    if (normalized.length < 3) {
      return NextResponse.json({ ok: true, unique: true, skipped: true });
    }

    const pb = await getInventoryAdminPb();
    const dup = await findDuplicateAwbForStore(pb, storeId, storeName, normalized);

    if (dup) {
      return NextResponse.json({
        ok: true,
        unique: false,
        orderNo: dup.orderNo,
        salesOrderId: dup.salesOrderId,
        message: `No. AWB "${normalized}" sudah dipakai di toko ini (order ${dup.orderNo}).`,
      });
    }

    return NextResponse.json({ ok: true, unique: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal cek AWB" },
      { status },
    );
  }
}
