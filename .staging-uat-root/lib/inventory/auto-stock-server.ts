import { buildBizStockNote } from "@/lib/bisnis/stock-notes";
import { getInventoryAdminPb, cleanMovementPayload } from "@/lib/inventory/pb-server";
import { generateMovementNo, postStockMovement } from "@/lib/inventory/stock-engine";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

export type AutoStockLine = { product: string; qty: number };

export type PostAutoStockMovementInput = {
  type: "SALE" | "PURCHASE";
  warehouse: string;
  reference_type: string;
  reference_id: string;
  reference_no: string;
  lines: AutoStockLine[];
  userId: string;
};

export type PostOutStockMovementInput = {
  warehouse: string;
  reference_type: string;
  reference_id?: string;
  reference_no: string;
  lines: AutoStockLine[];
  userId: string;
  noteSuffix?: string;
};

/** Posting stok keluar (OUT) dari satu gudang. */
export async function postOutStockMovementServer(input: PostOutStockMovementInput) {
  const { warehouse, lines, userId } = input;
  if (!warehouse || !lines?.length) {
    throw new Error("warehouse dan lines wajib diisi.");
  }

  const adminPb = await getInventoryAdminPb();
  const movementNo = generateMovementNo();
  const refType = input.reference_type || "OUT";
  const refNo = input.reference_no || movementNo;
  const refId = input.reference_id || "";
  const suffix = input.noteSuffix ? ` | ${input.noteSuffix}` : "";

  const movementData = cleanMovementPayload({
    movement_no: movementNo,
    movement_type: "OUT",
    status: "draft",
    warehouse,
    from_warehouse: warehouse,
    reference_type: refType,
    reference_id: refId || undefined,
    notes: `${buildBizStockNote(refType, refId, refNo)} | Keluar: ${refNo}${suffix}`,
    created_by: userId,
    device_platform: "web",
  });

  const movement = await adminPb
    .collection(INV_COLLECTIONS.movements)
    .create(movementData as Record<string, unknown>);

  for (const line of lines) {
    if (!line.product || !line.qty || line.qty <= 0) continue;
    await adminPb.collection(INV_COLLECTIONS.movementLines).create({
      movement: movement.id,
      product: line.product,
      qty: line.qty,
    });
  }

  return postStockMovement(adminPb, movement.id, userId);
}

/** Posting stok otomatis di server (tanpa fetch browser). */
export async function postAutoStockMovementServer(input: PostAutoStockMovementInput) {
  const { warehouse, lines, userId } = input;
  if (!warehouse || !lines?.length) {
    throw new Error("warehouse dan lines wajib diisi.");
  }

  const adminPb = await getInventoryAdminPb();
  const movementType = input.type === "SALE" ? "OUT" : "IN";
  const movementNo = generateMovementNo();
  const refType =
    input.reference_type || (input.type === "SALE" ? "SALES_ORDER" : "PURCHASE_ORDER");
  const refNo = input.reference_no || movementNo;
  const refId = input.reference_id || "";

  const movementData = cleanMovementPayload({
    movement_no: movementNo,
    movement_type: movementType,
    status: "draft",
    warehouse,
    reference_type: refType,
    reference_id: refId || undefined,
    notes: `${buildBizStockNote(refType, refId, refNo)} | Auto: ${refNo}`,
    created_by: userId,
    device_platform: "web",
  });

  if (movementType === "OUT") {
    movementData.from_warehouse = warehouse;
  } else {
    movementData.to_warehouse = warehouse;
  }

  const movement = await adminPb
    .collection(INV_COLLECTIONS.movements)
    .create(movementData as Record<string, unknown>);

  for (const line of lines) {
    if (!line.product || !line.qty || line.qty <= 0) continue;
    await adminPb.collection(INV_COLLECTIONS.movementLines).create({
      movement: movement.id,
      product: line.product,
      qty: line.qty,
    });
  }

  return postStockMovement(adminPb, movement.id, userId);
}
