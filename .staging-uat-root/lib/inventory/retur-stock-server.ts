import type PocketBase from "pocketbase";
import { buildBizStockNote } from "@/lib/bisnis/stock-notes";
import { getInventoryAdminPb, cleanMovementPayload } from "@/lib/inventory/pb-server";
import { generateMovementNo, postStockMovement, voidStockMovement } from "@/lib/inventory/stock-engine";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

export type ReturStockLine = { product: string; qty: number };

export type PostReturnStockInput = {
  to_warehouse: string;
  reference_type: string;
  reference_id: string;
  reference_no: string;
  lines: ReturStockLine[];
  userId: string;
  noteSuffix?: string;
  pb?: PocketBase;
};

export type PostedReturnStock = { movement_id: string; movement_no: string };

/** Posting stok masuk retur (movement_type RETURN) ke gudang tujuan. */
export async function postReturnStockMovementServer(
  input: PostReturnStockInput,
): Promise<PostedReturnStock> {
  const { to_warehouse, lines, userId } = input;
  if (!to_warehouse || !lines?.length) {
    throw new Error("to_warehouse dan lines wajib diisi.");
  }

  const adminPb = input.pb ?? (await getInventoryAdminPb());
  const movementNo = generateMovementNo();
  const refType = input.reference_type || "SALES_RETURN";
  const refNo = input.reference_no || movementNo;
  const refId = input.reference_id || "";
  const suffix = input.noteSuffix ? ` | ${input.noteSuffix}` : "";

  const movementData = cleanMovementPayload({
    movement_no: movementNo,
    movement_type: "RETURN",
    status: "draft",
    warehouse: to_warehouse,
    to_warehouse,
    reference_type: refType,
    reference_id: refId || undefined,
    notes: `${buildBizStockNote(refType, refId, refNo)} | Retur: ${refNo}${suffix}`,
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

  const posted = await postStockMovement(adminPb, movement.id, userId);
  return { movement_id: movement.id, movement_no: posted.movement_no };
}

/** Posting stok keluar retur pembelian (movement_type OUT). */
export async function postPurchaseReturnStockOutServer(
  input: PostReturnStockInput & { from_warehouse: string },
): Promise<PostedReturnStock> {
  const { from_warehouse, lines, userId } = input;
  if (!from_warehouse || !lines?.length) {
    throw new Error("from_warehouse dan lines wajib diisi.");
  }

  const adminPb = input.pb ?? (await getInventoryAdminPb());
  const movementNo = generateMovementNo();
  const refType = input.reference_type || "PURCHASE_RETURN";
  const refNo = input.reference_no || movementNo;
  const refId = input.reference_id || "";

  const movementData = cleanMovementPayload({
    movement_no: movementNo,
    movement_type: "OUT",
    status: "draft",
    warehouse: from_warehouse,
    from_warehouse,
    reference_type: refType,
    reference_id: refId || undefined,
    notes: `${buildBizStockNote(refType, refId, refNo)} | Retur pembelian: ${refNo}`,
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

  const posted = await postStockMovement(adminPb, movement.id, userId);
  return { movement_id: movement.id, movement_no: posted.movement_no };
}

/** Void semua mutasi retur yang terposting untuk satu dokumen retur. */
export async function voidReturnStockMovements(
  pb: PocketBase,
  returId: string,
  userId: string,
  note?: string,
): Promise<number> {
  const list = await pb.collection(INV_COLLECTIONS.movements).getFullList({
    filter: `status = "posted" && reference_id = "${returId}"`,
    sort: "-created",
    requestKey: null,
  });
  let voided = 0;
  for (const row of list) {
    const refType = String((row as { reference_type?: string }).reference_type ?? "");
    if (!refType.startsWith("SALES_RETURN") && refType !== "PURCHASE_RETURN") continue;
    await voidStockMovement(pb, row.id, userId, note);
    voided++;
  }
  return voided;
}
