import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { scanPackingBarcode } from "@/lib/inventory/packing-engine";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await requireInventoryAccess(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as { barcode: string };
    if (!body.barcode?.trim()) {
      return NextResponse.json({ ok: false, error: "barcode wajib." }, { status: 400 });
    }

    const pb = await getUserPbFromRequest(req, auth);
    const result = await scanPackingBarcode(pb, id, auth.userId, body.barcode.trim());

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return jsonError(err);
  }
}
