import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getInboundQueueServer } from "@/lib/wms/inbound-queue-server";

export async function GET(req: Request) {
  try {
    await requireInventoryAccess(req);
    const data = await getInboundQueueServer();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return jsonError(err, "Gagal memuat antrean penerimaan.");
  }
}
