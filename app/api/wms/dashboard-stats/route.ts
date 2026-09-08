import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getWmsDashboardStatsServer } from "@/lib/wms/dashboard-stats-server";

export async function GET(req: Request) {
  try {
    await requireInventoryAccess(req);
    const data = await getWmsDashboardStatsServer();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return jsonError(err, "Gagal memuat ringkasan gudang.");
  }
}
