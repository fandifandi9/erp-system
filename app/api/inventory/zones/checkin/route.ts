import { NextResponse } from "next/server";
import { InventoryApiError, jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { checkInZone, resolveZoneFromInput } from "@/lib/inventory/zone-engine";

type Body = { qr_payload?: string; zone_id?: string };

export async function POST(req: Request) {
  try {
    const auth = await requireInventoryAccess(req);
    const body = (await req.json()) as Body;

    const adminPb = await getInventoryAdminPb();
    const zone = await resolveZoneFromInput(adminPb, body);
    const session = await checkInZone(adminPb, auth.userId, zone, {
      viaQr: Boolean(body.qr_payload?.trim()),
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: session.id,
        zone: zone.id,
        warehouse: zone.warehouse,
        status: session.status,
        check_in_at: session.check_in_at,
        zone_code: zone.code,
        zone_name: zone.name,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("tidak dikenali")) {
      return jsonError(new InventoryApiError(err.message, 400));
    }
    return jsonError(err);
  }
}
