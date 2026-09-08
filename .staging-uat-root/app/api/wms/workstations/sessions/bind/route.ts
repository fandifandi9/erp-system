import { NextResponse } from "next/server";
import { getApiAuthUser, InventoryApiError, jsonError } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { bindWorkstationSessionToUser } from "@/lib/wms/workstation-session";

type Body = { session_id?: string };

export async function POST(req: Request) {
  try {
    const auth = await getApiAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    if (!body.session_id?.trim()) {
      return jsonError(new InventoryApiError("session_id wajib", 400));
    }

    const adminPb = await getInventoryAdminPb();
    const session = await bindWorkstationSessionToUser(
      adminPb,
      body.session_id.trim(),
      auth.userId,
    );

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
    if (err instanceof Error) {
      return jsonError(new InventoryApiError(err.message, 400));
    }
    return jsonError(err);
  }
}
