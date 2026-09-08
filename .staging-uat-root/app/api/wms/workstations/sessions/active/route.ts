import { NextResponse } from "next/server";
import { getApiAuthUser, jsonError } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { resolveWorkstationSessionForOperator } from "@/lib/wms/workstation-session";

export async function GET(req: Request) {
  try {
    const auth = await getApiAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const deviceId = url.searchParams.get("device_id")?.trim() || undefined;

    const adminPb = await getInventoryAdminPb();
    const session = await resolveWorkstationSessionForOperator(
      adminPb,
      auth.userId,
      deviceId,
    );

    if (!session) {
      return NextResponse.json({ ok: true, data: null });
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: session.id,
        userId: session.userId,
        workstation: session.workstation,
        channel: session.channel,
        deviceId: session.deviceId,
        bonusEligible: session.bonusEligible,
        checkInAt: session.checkInAt,
        needsBind: session.needsBind,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
