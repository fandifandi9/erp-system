import type PocketBase from "pocketbase";
import type { MovementType } from "@/lib/inventory/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

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
  if (onHand < 0) {
    throw new Error(
      `Stok tidak cukup untuk produk ${productId} (butuh ${Math.abs(delta)}, tersedia ${balance.qty_on_hand}).`
    );
  }
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
