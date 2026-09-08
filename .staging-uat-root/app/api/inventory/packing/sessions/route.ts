import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { createPackingSession } from "@/lib/inventory/packing-engine";

export async function POST(req: Request) {
  try {
    const auth = await requireInventoryAccess(req);
    const body = (await req.json()) as {
      packing_station_id: string;
      order_ref: string;
      order_source?: string;
      notes?: string;
      lines: { product: string; expected_qty: number }[];
      device_platform?: string;
    };

    const pb = await getUserPbFromRequest(req, auth);
    const session = await createPackingSession(pb, auth.userId, {
      ...body,
      device_platform: body.device_platform || "web",
    });

    return NextResponse.json({ ok: true, data: { id: session.id, status: session.status } });
  } catch (err) {
    return jsonError(err);
  }
}
