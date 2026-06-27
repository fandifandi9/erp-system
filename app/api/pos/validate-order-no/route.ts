import { NextResponse } from "next/server";
import { requirePosApiUser } from "@/lib/pos/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { findDuplicateOrderNoForStore } from "@/lib/pos/order-no-unique";
import { isDocNoTaken, BIZ_DOC_NUMBER_CONFIG } from "@/lib/bisnis/doc-number";

export async function GET(req: Request) {
  try {
    await requirePosApiUser(req);
    const url = new URL(req.url);
    const orderNo = url.searchParams.get("orderNo")?.trim() ?? "";
    const storeId = url.searchParams.get("store")?.trim() ?? "";
    const storeName = url.searchParams.get("storeName")?.trim() ?? "";

    if (!storeId) {
      return NextResponse.json({ error: "Parameter store wajib" }, { status: 400 });
    }

    if (!orderNo || orderNo.length < 2) {
      return NextResponse.json({ ok: true, unique: true, skipped: true });
    }

    const pb = await getInventoryAdminPb();

    if (await isDocNoTaken(BIZ_DOC_NUMBER_CONFIG.so, orderNo)) {
      return NextResponse.json({
        ok: true,
        unique: false,
        message: `No. pesanan "${orderNo}" sudah dipakai di sistem. Gunakan nomor lain.`,
      });
    }

    const dup = await findDuplicateOrderNoForStore(pb, storeId, storeName, orderNo);
    if (dup) {
      return NextResponse.json({
        ok: true,
        unique: false,
        orderNo: dup.orderNo,
        salesOrderId: dup.salesOrderId,
        message: `No. pesanan "${orderNo}" sudah dipakai di toko ini (order ${dup.orderNo}).`,
      });
    }

    return NextResponse.json({ ok: true, unique: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal cek nomor pesanan" },
      { status },
    );
  }
}
