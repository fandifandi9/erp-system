import { NextResponse } from "next/server";
import { buildBizStockNote } from "@/lib/bisnis/stock-notes";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb, cleanMovementPayload } from "@/lib/inventory/pb-server";
import { generateMovementNo, postStockMovement } from "@/lib/inventory/stock-engine";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

type LineInput = { product: string; qty: number };

type RequestBody = {
  type: "SALE" | "PURCHASE";
  warehouse: string;
  reference_type: string;
  reference_id: string;
  reference_no: string;
  lines: LineInput[];
  user_id: string;
};

export async function POST(req: Request) {
  try {
    const auth = await getApiAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as RequestBody;

    if (!body.warehouse || !body.lines?.length) {
      return NextResponse.json(
        { ok: false, error: "warehouse dan lines wajib diisi." },
        { status: 400 },
      );
    }

    const userId = body.user_id?.trim() || auth.userId;
    const adminPb = await getInventoryAdminPb();

    const movementType = body.type === "SALE" ? "OUT" : "IN";
    const movementNo = generateMovementNo();

    const refType =
      body.reference_type || (body.type === "SALE" ? "SALES_ORDER" : "PURCHASE_ORDER");
    const refNo = body.reference_no || movementNo;
    const refId = body.reference_id || "";

    const movementData = cleanMovementPayload({
      movement_no: movementNo,
      movement_type: movementType,
      status: "draft",
      warehouse: body.warehouse,
      reference_type: refType,
      reference_id: refId || undefined,
      notes: `${buildBizStockNote(refType, refId, refNo)} | Auto: ${refNo}`,
      created_by: userId,
      device_platform: "web",
    });

    if (movementType === "OUT") {
      movementData.from_warehouse = body.warehouse;
    } else {
      movementData.to_warehouse = body.warehouse;
    }

    const movement = await adminPb
      .collection(INV_COLLECTIONS.movements)
      .create(movementData as Record<string, unknown>);

    for (const line of body.lines) {
      if (!line.product || !line.qty || line.qty <= 0) continue;
      await adminPb.collection(INV_COLLECTIONS.movementLines).create({
        movement: movement.id,
        product: line.product,
        qty: line.qty,
      });
    }

    const result = await postStockMovement(adminPb, movement.id, userId);

    return NextResponse.json({ ok: true, data: { movement_id: movement.id, ...result } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal membuat pergerakan stok otomatis.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
