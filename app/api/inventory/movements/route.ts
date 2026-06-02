import { NextResponse } from "next/server";
import {
  InventoryApiError,
  jsonError,
  requireInventoryDraftAccess,
} from "@/lib/inventory/api-auth";
import {
  cleanMovementPayload,
  getInventoryAdminPb,
  getUserPbFromRequest,
} from "@/lib/inventory/pb-server";
import { generateMovementNo } from "@/lib/inventory/stock-engine";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { MovementType } from "@/lib/inventory/types";

type CreateBody = {
  movement_type: MovementType;
  warehouse: string;
  from_location?: string;
  to_location?: string;
  from_warehouse?: string;
  to_warehouse?: string;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  lines: { product: string; qty: number }[];
  post?: boolean;
  device_platform?: string;
};

const VALID_TYPES: MovementType[] = [
  "IN",
  "OUT",
  "TRANSFER",
  "RETURN",
  "DAMAGE",
  "ADJUSTMENT",
];

export async function POST(req: Request) {
  try {
    const auth = await requireInventoryDraftAccess(req);
    const body = (await req.json()) as CreateBody;

    if (!body.warehouse || !body.movement_type) {
      throw new InventoryApiError("warehouse dan movement_type wajib.");
    }
    if (!VALID_TYPES.includes(body.movement_type)) {
      throw new InventoryApiError("movement_type tidak valid.");
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      throw new InventoryApiError("Minimal satu baris produk.");
    }

    const pb = await getUserPbFromRequest(req, auth);

    const movement = await pb.collection(INV_COLLECTIONS.movements).create(
      cleanMovementPayload({
        movement_no: generateMovementNo(),
        movement_type: body.movement_type,
        status: "draft",
        warehouse: body.warehouse,
        from_warehouse: body.from_warehouse,
        to_warehouse: body.to_warehouse,
        from_location: body.from_location,
        to_location: body.to_location,
        reference_type: body.reference_type || "MANUAL",
        reference_id: body.reference_id,
        notes: body.notes || "",
        created_by: auth.userId,
        device_platform: body.device_platform || "web",
      })
    );

    let totalQty = 0;
    for (const line of body.lines) {
      const qty = Number(line.qty);
      if (!line.product || !Number.isFinite(qty) || qty === 0) {
        throw new InventoryApiError("Setiap baris wajib product dan qty valid.");
      }
      totalQty += Math.abs(qty);
      await pb.collection(INV_COLLECTIONS.movementLines).create({
        movement: movement.id,
        product: line.product,
        qty,
      });
    }

    // PB rule Update membutuhkan @request.data.status = "draft"; tanpa ini → 404.
    await pb.collection(INV_COLLECTIONS.movements).update(movement.id, {
      status: "draft",
      total_qty: totalQty,
      line_count: body.lines.length,
    });

    if (body.post) {
      const { canPostInventoryMovement } = await import("@/lib/inventory/access");
      if (!canPostInventoryMovement(auth.user)) {
        throw new InventoryApiError("Tidak boleh langsung post.", 403);
      }
      const adminPb = await getInventoryAdminPb();
      const { postStockMovement } = await import("@/lib/inventory/stock-engine");
      await postStockMovement(adminPb, movement.id, auth.userId);
    }

    return NextResponse.json({
      ok: true,
      data: { id: movement.id, movement_no: movement.movement_no },
    });
  } catch (err) {
    return jsonError(err);
  }
}
