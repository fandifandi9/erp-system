import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { loadStoreByWarehouse } from "@/lib/bisnis/share-public";
import { BISNIS_COLLECTIONS, type PurchaseOrder } from "@/lib/bisnis/types";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const pb = await getInventoryAdminPb();
    const po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(
      id,
      { expand: "supplier,warehouse" },
    );
    if (po.status === "cancelled") {
      return NextResponse.json({ error: "PO dibatalkan" }, { status: 410 });
    }
    const store = await loadStoreByWarehouse(po.warehouse);
    return NextResponse.json({
      po_no: po.po_no,
      order_date: po.order_date,
      expected_date: po.expected_date,
      total: po.total,
      status: po.status,
      supplier_name: po.expand?.supplier?.name ?? "Supplier",
      warehouse_name: po.expand?.warehouse?.name,
      store,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Tidak ditemukan";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
