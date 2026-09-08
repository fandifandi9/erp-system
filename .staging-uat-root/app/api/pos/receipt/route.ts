import { NextResponse } from "next/server";
import { requirePosApiUser } from "@/lib/pos/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { buildPosReceiptFromSalesOrder } from "@/lib/pos/build-receipt-from-so";

export async function GET(req: Request) {
  try {
    await requirePosApiUser(req);
    const url = new URL(req.url);
    const soId = url.searchParams.get("so")?.trim();
    const invId = url.searchParams.get("inv")?.trim();
    if (!soId && !invId) {
      return NextResponse.json({ error: "Parameter so atau inv wajib" }, { status: 400 });
    }

    const adminPb = await getInventoryAdminPb();

    let salesOrderId = soId;

    if (invId && !salesOrderId) {
      const inv = await adminPb.collection("biz_invoices").getOne(invId, {
        fields: "sales_order",
      });
      salesOrderId = String((inv as { sales_order?: string }).sales_order ?? "");
    }

    if (!salesOrderId) {
      return NextResponse.json({ error: "Sales order tidak ditemukan" }, { status: 404 });
    }

    const payload = await buildPosReceiptFromSalesOrder(adminPb, salesOrderId, {
      invoiceId: invId ?? undefined,
    });
    if (!payload) {
      return NextResponse.json({ error: "Bukan transaksi POS" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal memuat struk" },
      { status },
    );
  }
}
