import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { loadStoreByWarehouse } from "@/lib/bisnis/share-public";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { assertShareAccess } from "@/lib/share-api-auth";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gate = await assertShareAccess(req, {
    collection: BISNIS_COLLECTIONS.salesOrders,
    recordId: id,
    shareTokenField: "share_token",
  });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  try {
    const pb = await getInventoryAdminPb();
    const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(id, {
      expand: "customer,warehouse",
    });
    if (so.status === "cancelled") {
      return NextResponse.json({ error: "Dokumen dibatalkan" }, { status: 410 });
    }
    const store = await loadStoreByWarehouse(so.warehouse);
    return NextResponse.json({
      order_no: so.order_no,
      order_date: so.order_date,
      total: so.total,
      status: so.status,
      customer_name: so.expand?.customer?.name ?? "Pelanggan",
      warehouse_name: so.expand?.warehouse?.name,
      store,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Tidak ditemukan";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
