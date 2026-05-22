import { NextResponse } from "next/server";
import {
  InventoryApiError,
  jsonError,
  requireInventoryAccess,
} from "@/lib/inventory/api-auth";
import { canViewAllStaffActivities } from "@/lib/inventory/access";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { checkOutZone, getActiveZoneSession } from "@/lib/inventory/zone-engine";

type Body = { session_id?: string; forced?: boolean; reason?: string };

export async function POST(req: Request) {
  try {
    const auth = await requireInventoryAccess(req);
    const body = (await req.json()) as Body;
    const adminPb = await getInventoryAdminPb();

    let sessionId = body.session_id?.trim();
    if (!sessionId) {
      const active = await getActiveZoneSession(adminPb, auth.userId);
      if (!active) {
        throw new InventoryApiError("Tidak ada sesi zona aktif.", 400);
      }
      sessionId = active.id;
    }

    const forced = Boolean(body.forced);
    if (forced && !canViewAllStaffActivities(auth.user)) {
      throw new InventoryApiError("Hanya supervisor yang boleh menutup paksa.", 403);
    }

    const session = await checkOutZone(adminPb, sessionId, auth.userId, {
      forced,
      reason: body.reason,
      devicePlatform: "web",
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: session.id,
        status: session.status,
        check_out_at: session.check_out_at,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
