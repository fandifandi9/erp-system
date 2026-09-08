import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { getActiveZoneSession } from "@/lib/inventory/zone-engine";

export async function GET(req: Request) {
  try {
    const auth = await requireInventoryAccess(req);
    const adminPb = await getInventoryAdminPb();
    const session = await getActiveZoneSession(adminPb, auth.userId);

    if (!session) {
      return NextResponse.json({ ok: true, data: null });
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: session.id,
        status: session.status,
        check_in_at: session.check_in_at,
        warehouse: session.warehouse,
        zone: session.zone,
        expand: session.expand,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
