import { NextResponse } from "next/server";
import { getApiAuthUser, InventoryApiError, jsonError } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { checkOutWorkstationSession } from "@/lib/wms/workstation-session";

type Body = { session_id?: string; device_id?: string };

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
    await checkOutWorkstationSession(adminPb, body.session_id.trim(), {
      userId: auth.userId,
      deviceId: body.device_id?.trim(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) {
      return jsonError(new InventoryApiError(err.message, 400));
    }
    return jsonError(err);
  }
}
