import { buildBizStockNote } from "@/lib/bisnis/stock-notes";import { applyDamagedTransferAccounting } from "@/lib/inventory/damaged-accounting";
import { assertDamagedTransferRules } from "@/lib/inventory/damaged-company-guard";
import { getInventoryAdminPb, cleanMovementPayload } from "@/lib/inventory/pb-server";
import { generateMovementNo, postStockMovement } from "@/lib/inventory/stock-engine";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { AutoStockLine } from "./auto-stock-server";

export type PostTransferStockInput = {
  from_warehouse: string;
  to_warehouse: string;
  reference_type: string;
  reference_id: string;
  reference_no: string;
  lines: AutoStockLine[];
  userId: string;
  noteSuffix?: string;
};

/** Transfer stok antar gudang (movement_type TRANSFER) — posting langsung. */
export async function postTransferStockMovementServer(input: PostTransferStockInput) {
  const { from_warehouse, to_warehouse, lines, userId } = input;
  if (!from_warehouse || !to_warehouse || !lines?.length) {
    throw new Error("from_warehouse, to_warehouse, dan lines wajib diisi.");
  }
  if (from_warehouse === to_warehouse) {
    throw new Error("Gudang asal dan tujuan tidak boleh sama.");
  }

  const adminPb = await getInventoryAdminPb();
  const movementNo = generateMovementNo();
  const refType = input.reference_type || "TRANSFER";
  const refNo = input.reference_no || movementNo;
  const refId = input.reference_id || "";
  const suffix = input.noteSuffix ? ` | ${input.noteSuffix}` : "";

  await assertDamagedTransferRules(adminPb, {
    fromWarehouseId: from_warehouse,
    toWarehouseId: to_warehouse,
    referenceType: refType,
  });

  const movementData = cleanMovementPayload({
    movement_no: movementNo,
    movement_type: "TRANSFER",
    status: "draft",
    warehouse: from_warehouse,
    from_warehouse,
    to_warehouse,
    reference_type: refType,
    reference_id: refId || undefined,
    notes: `${buildBizStockNote(refType, refId, refNo)} | Transfer: ${refNo}${suffix}`,
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

  await postStockMovement(adminPb, movement.id, userId);

  const accounting = await applyDamagedTransferAccounting({
    pb: adminPb,
    fromWarehouseId: from_warehouse,
    toWarehouseId: to_warehouse,
    referenceType: refType,
    referenceNo: refNo,
    lines,
    userId,
    noteSuffix: suffix,
  });

  return { movement, accounting };
}
