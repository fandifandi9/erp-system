import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { MovementType } from "@/lib/inventory/types";
import { cleanMovementPayload } from "@/lib/inventory/pb-server";

type BalanceRow = {
  id: string;
  warehouse: string;
  location?: string;
  product: string;
  qty_on_hand: number;
  qty_reserved: number;
  qty_available: number;
  version?: number;
};

type MovementRow = {
  id: string;
  movement_no: string;
  movement_type: MovementType;
  status: string;
  warehouse: string;
  from_warehouse?: string;
  to_warehouse?: string;
  from_location?: string;
  to_location?: string;
  reference_type?: string;
  reference_no?: string;
  notes?: string;
};

type LineRow = {
  id: string;
  product: string;
  qty: number;
};

type DeltaTarget = {
  warehouseId: string;
  locationId: string;
  productId: string;
  delta: number;
};

function locFilter(locationId: string): string {
  if (!locationId) return '(location = "" || location = null)';
  return `location = "${locationId}"`;
}

async function findBalance(
  pb: PocketBase,
  warehouseId: string,
  locationId: string,
  productId: string
): Promise<BalanceRow | null> {
  const filter = `warehouse = "${warehouseId}" && product = "${productId}" && ${locFilter(locationId)}`;
  const list = await pb.collection(INV_COLLECTIONS.balances).getList(1, 1, { filter });
  return (list.items[0] as unknown as BalanceRow) || null;
}

async function getOrCreateBalance(
  pb: PocketBase,
  warehouseId: string,
  locationId: string,
  productId: string
): Promise<BalanceRow> {
  const existing = await findBalance(pb, warehouseId, locationId, productId);
  if (existing) return existing;

  const created = await pb.collection(INV_COLLECTIONS.balances).create({
    warehouse: warehouseId,
    location: locationId || "",
    product: productId,
    qty_on_hand: 0,
    qty_reserved: 0,
    qty_available: 0,
    version: 0,
  });
  return created as unknown as BalanceRow;
}

async function applyDelta(
  pb: PocketBase,
  warehouseId: string,
  locationId: string,
  productId: string,
  delta: number
): Promise<void> {
  const balance = await getOrCreateBalance(pb, warehouseId, locationId, productId);
  const onHand = Number(balance.qty_on_hand) + delta;
  const reserved = Number(balance.qty_reserved) || 0;
  await pb.collection(INV_COLLECTIONS.balances).update(balance.id, {
    qty_on_hand: onHand,
    qty_available: onHand - reserved,
    version: (Number(balance.version) || 0) + 1,
    last_posted_at: new Date().toISOString(),
  });
}

function buildDeltas(movement: MovementRow, line: LineRow): DeltaTarget[] {
  const qty = Number(line.qty);
  if (!Number.isFinite(qty) || qty === 0) return [];

  const wh = movement.warehouse;
  const type = movement.movement_type;

  switch (type) {
    case "IN":
    case "RETURN":
      return [
        {
          warehouseId: movement.to_warehouse || wh,
          locationId: movement.to_location || "",
          productId: line.product,
          delta: Math.abs(qty),
        },
      ];
    case "OUT":
    case "DAMAGE":
      return [
        {
          warehouseId: movement.from_warehouse || wh,
          locationId: movement.from_location || "",
          productId: line.product,
          delta: -Math.abs(qty),
        },
      ];
    case "TRANSFER":
      return [
        {
          warehouseId: movement.from_warehouse || wh,
          locationId: movement.from_location || "",
          productId: line.product,
          delta: -Math.abs(qty),
        },
        {
          warehouseId: movement.to_warehouse || wh,
          locationId: movement.to_location || "",
          productId: line.product,
          delta: Math.abs(qty),
        },
      ];
    case "ADJUSTMENT":
      return [
        {
          warehouseId: wh,
          locationId: movement.to_location || movement.from_location || "",
          productId: line.product,
          delta: qty,
        },
      ];
    default:
      return [];
  }
}

export function generateMovementNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const t = String(d.getTime()).slice(-6);
  return `MOV-${y}${m}${day}-${t}`;
}

export async function postStockMovement(
  pb: PocketBase,
  movementId: string,
  postedByUserId: string
): Promise<{ movement_no: string }> {
  const movement = (await pb
    .collection(INV_COLLECTIONS.movements)
    .getOne(movementId)) as unknown as MovementRow;

  if (movement.status === "posted") {
    return { movement_no: movement.movement_no };
  }
  if (movement.status !== "draft") {
    throw new Error("Hanya movement berstatus draft yang bisa diposting.");
  }

  const lines = await pb.collection(INV_COLLECTIONS.movementLines).getFullList({
    filter: `movement = "${movementId}"`,
  });

  if (lines.length === 0) {
    throw new Error("Movement tidak memiliki baris produk.");
  }

  if (
    movement.movement_type === "TRANSFER" &&
    movement.from_warehouse &&
    movement.to_warehouse
  ) {
    const { assertDamagedTransferRules } = await import("@/lib/inventory/damaged-company-guard");
    await assertDamagedTransferRules(pb, {
      fromWarehouseId: movement.from_warehouse,
      toWarehouseId: movement.to_warehouse,
      referenceType: movement.reference_type,
    });
  }

  const deltas: DeltaTarget[] = [];
  for (const line of lines) {
    deltas.push(...buildDeltas(movement, line as unknown as LineRow));
  }

  for (const d of deltas) {
    await applyDelta(pb, d.warehouseId, d.locationId, d.productId, d.delta);
  }

  const totalQty = lines.reduce(
    (s, l) => s + Math.abs(Number((l as unknown as { qty: number }).qty) || 0),
    0
  );

  await pb.collection(INV_COLLECTIONS.movements).update(movementId, {
    status: "posted",
    posted_at: new Date().toISOString(),
    posted_by: postedByUserId,
    total_qty: totalQty,
    line_count: lines.length,
  });

  try {
    await pb.collection(INV_COLLECTIONS.auditLog).create({
      action: "movement.post",
      entity_type: "inv_stock_movements",
      entity_id: movementId,
      user: postedByUserId,
      warehouse: movement.warehouse,
      after: { movement_no: movement.movement_no, total_qty: totalQty },
      occurred_at: new Date().toISOString(),
    });
  } catch {
    /* audit optional */
  }

  return { movement_no: movement.movement_no };
}

function voidReversalType(type: MovementType): MovementType {
  switch (type) {
    case "IN":
      return "OUT";
    case "OUT":
      return "IN";
    case "RETURN":
      return "OUT";
    case "DAMAGE":
      return "IN";
    case "TRANSFER":
      return "TRANSFER";
    case "ADJUSTMENT":
      return "ADJUSTMENT";
    default:
      return "ADJUSTMENT";
  }
}

/** Batalkan movement posted — buat reversal, post, tandai void. */
export async function voidStockMovement(
  pb: PocketBase,
  movementId: string,
  userId: string,
  note?: string
): Promise<{ reversal_id: string; movement_no: string }> {
  const movement = (await pb
    .collection(INV_COLLECTIONS.movements)
    .getOne(movementId)) as unknown as MovementRow & { status: string; movement_no: string };

  if (movement.status === "void") {
    return { reversal_id: "", movement_no: movement.movement_no };
  }
  if (movement.status !== "posted") {
    throw new Error("Hanya movement posted yang bisa di-void.");
  }

  const lines = await pb.collection(INV_COLLECTIONS.movementLines).getFullList({
    filter: `movement = "${movementId}"`,
  });
  if (lines.length === 0) throw new Error("Movement tidak memiliki baris.");

  const revType = voidReversalType(movement.movement_type);
  const isTransfer = movement.movement_type === "TRANSFER";

  const reversal = await pb.collection(INV_COLLECTIONS.movements).create(
    cleanMovementPayload({
      movement_no: generateMovementNo(),
      movement_type: revType,
      status: "draft",
      warehouse: movement.warehouse,
      from_warehouse: isTransfer ? movement.to_warehouse : movement.from_warehouse,
      to_warehouse: isTransfer ? movement.from_warehouse : movement.to_warehouse,
      from_location: isTransfer ? movement.to_location : movement.from_location,
      to_location: isTransfer ? movement.from_location : movement.to_location,
      reference_type: "VOID",
      reference_id: movementId,
      parent_movement: movementId,
      notes: note?.trim() || `Void ${movement.movement_no}`,
      created_by: userId,
      device_platform: "web",
    })
  );

  for (const line of lines) {
    const row = line as unknown as LineRow;
    const qty = Number(row.qty);
    const revQty =
      movement.movement_type === "ADJUSTMENT" ? -qty : Math.abs(qty);
    await pb.collection(INV_COLLECTIONS.movementLines).create({
      movement: reversal.id,
      product: row.product,
      qty: revQty,
    });
  }

  await postStockMovement(pb, reversal.id, userId);

  const now = new Date().toISOString();
  await pb.collection(INV_COLLECTIONS.movements).update(movementId, {
    status: "void",
    cancelled_at: now,
    cancelled_by: userId,
  });

  try {
    await pb.collection(INV_COLLECTIONS.auditLog).create({
      action: "movement.void",
      entity_type: "inv_stock_movements",
      entity_id: movementId,
      user: userId,
      warehouse: movement.warehouse,
      after: { reversal_id: reversal.id, movement_no: movement.movement_no },
      occurred_at: now,
    });
  } catch {
    /* optional */
  }

  return { reversal_id: reversal.id, movement_no: movement.movement_no };
}
