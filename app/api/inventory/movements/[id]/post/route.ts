import { NextResponse } from "next/server";
import { jsonError, requireInventoryPostAccess } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { postStockMovement } from "@/lib/inventory/stock-engine";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { CctvSnapshot } from "@/lib/inventory/types";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireInventoryPostAccess(req);
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID movement wajib." }, { status: 400 });
    }

    let cctvCameraId: string | undefined;
    try {
      const body = (await req.json()) as { cctv_camera_id?: string };
      cctvCameraId = body.cctv_camera_id?.trim();
    } catch {
      /* body opsional */
    }

    const adminPb = await getInventoryAdminPb();

    if (cctvCameraId) {
      const userPb = await getUserPbFromRequest(req, auth);
      try {
        const cam = (await userPb.collection(INV_COLLECTIONS.cctvCameras).getOne(cctvCameraId)) as {
          id: string;
          code?: string;
          channel?: string;
          playback_hint_url?: string;
        };
        const snapshot: CctvSnapshot = {
          camera: cam.id,
          camera_code: cam.code,
          channel: cam.channel,
          event_at: new Date().toISOString(),
          playback_hint_url: cam.playback_hint_url,
          offset_sec_before: 30,
          offset_sec_after: 120,
        };
        await adminPb.collection(INV_COLLECTIONS.movements).update(id, {
          cctv_snapshot: snapshot,
        });
      } catch {
        /* kamera opsional — lanjut post */
      }
    }

    const result = await postStockMovement(adminPb, id, auth.userId);

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return jsonError(err);
  }
}
