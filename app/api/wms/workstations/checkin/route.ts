import { NextResponse } from "next/server";
import { getApiAuthUser, InventoryApiError, jsonError } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { normalizeWorkstationCheckInInput } from "@/lib/wms/workstation-qr";
import {
  checkInWorkstation,
  resolveWorkstationFromInput,
  type WmsSessionChannel,
} from "@/lib/wms/workstation-session";

type Body = {
  qr_payload?: string;
  workstation_code?: string;
  /** Paste kode singkat atau QR penuh */
  desk_input?: string;
  channel?: WmsSessionChannel;
  device_id?: string;
};

function sessionDto(session: Awaited<ReturnType<typeof checkInWorkstation>>) {
  return {
    id: session.id,
    userId: session.userId,
    workstation: session.workstation,
    channel: session.channel,
    deviceId: session.deviceId,
    bonusEligible: session.bonusEligible,
    checkInAt: session.checkInAt,
    needsBind: session.needsBind,
  };
}

export async function POST(req: Request) {
  try {
    const auth = await getApiAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const channel = body.channel ?? "web_desk_scan";
    const normalized = body.desk_input?.trim()
      ? normalizeWorkstationCheckInInput(body.desk_input)
      : {
          qr_payload: body.qr_payload,
          workstation_code: body.workstation_code,
        };
    const adminPb = await getInventoryAdminPb();
    const workstation = await resolveWorkstationFromInput(adminPb, normalized);

    const isTerminal = channel === "office_terminal";
    const session = await checkInWorkstation(adminPb, workstation, {
      userId: isTerminal ? undefined : auth.userId,
      channel,
      deviceId: body.device_id?.trim() || undefined,
      viaQr: Boolean(body.qr_payload?.trim()),
      devicePlatform: "web",
    });

    return NextResponse.json({ ok: true, data: sessionDto(session) });
  } catch (err) {
    if (err instanceof Error) {
      return jsonError(new InventoryApiError(err.message, 400));
    }
    return jsonError(err);
  }
}
