import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS, type InvStockBalance, type InvMovement } from "@/lib/inventory/types";

export type StockSummary = {
  totalProducts: number;
  totalWarehouses: number;
  criticalStockCount: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
};

export type StockByWarehouse = {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  productCount: number;
};

export type StockMovementSummary = {
  totalIn: number;
  totalOut: number;
  totalTransfer: number;
  draftCount: number;
  postedCount: number;
};

export async function getStockSummary(): Promise<StockSummary> {
  const balances = await pb.collection(INV_COLLECTIONS.balances).getFullList<InvStockBalance>({
    requestKey: null,
  });

  const products = new Set(balances.map((b) => b.product));
  const warehouses = new Set(balances.map((b) => b.warehouse));

  let totalOnHand = 0;
  let totalReserved = 0;
  let totalAvailable = 0;
  let criticalStockCount = 0;

  for (const b of balances) {
    totalOnHand += b.qty_on_hand;
    totalReserved += b.qty_reserved;
    totalAvailable += b.qty_available;
  }

  try {
    const allProducts = await pb.collection(INV_COLLECTIONS.products).getFullList({
      requestKey: null,
    });
    for (const prod of allProducts) {
      const minStock = (prod as Record<string, unknown>).min_stock as number | undefined;
      if (minStock != null && minStock > 0) {
        const prodBalances = balances.filter((b) => b.product === prod.id);
        const totalQty = prodBalances.reduce((sum, b) => sum + b.qty_available, 0);
        if (totalQty <= minStock) criticalStockCount++;
      }
    }
  } catch {
    // products collection might not be accessible
  }

  return {
    totalProducts: products.size,
    totalWarehouses: warehouses.size,
    criticalStockCount,
    totalOnHand,
    totalReserved,
    totalAvailable,
  };
}

export async function getStockByWarehouse(): Promise<StockByWarehouse[]> {
  const balances = await pb.collection(INV_COLLECTIONS.balances).getFullList<InvStockBalance>({
    expand: "warehouse",
    requestKey: null,
  });

  const warehouseMap = new Map<string, StockByWarehouse>();

  for (const b of balances) {
    const wh = b.expand?.warehouse;
    if (!warehouseMap.has(b.warehouse)) {
      warehouseMap.set(b.warehouse, {
        warehouseId: b.warehouse,
        warehouseCode: wh?.code ?? "",
        warehouseName: wh?.name ?? b.warehouse,
        totalOnHand: 0,
        totalReserved: 0,
        totalAvailable: 0,
        productCount: 0,
      });
    }
    const entry = warehouseMap.get(b.warehouse)!;
    entry.totalOnHand += b.qty_on_hand;
    entry.totalReserved += b.qty_reserved;
    entry.totalAvailable += b.qty_available;
    entry.productCount++;
  }

  return Array.from(warehouseMap.values());
}

export async function getMovementSummary(days = 30): Promise<StockMovementSummary> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const filter = `created >= "${since.toISOString()}"`;

  const movements = await pb.collection(INV_COLLECTIONS.movements).getFullList<InvMovement>({
    filter,
    requestKey: null,
  });

  let totalIn = 0;
  let totalOut = 0;
  let totalTransfer = 0;
  let draftCount = 0;
  let postedCount = 0;

  for (const m of movements) {
    if (m.status === "draft") draftCount++;
    if (m.status === "posted") postedCount++;
    if (m.movement_type === "IN") totalIn++;
    if (m.movement_type === "OUT") totalOut++;
    if (m.movement_type === "TRANSFER") totalTransfer++;
  }

  return { totalIn, totalOut, totalTransfer, draftCount, postedCount };
}

/**
 * Reserves stock for a sales order.
 * Creates a reservation movement (draft) that can be converted to OUT on fulfillment.
 */
export async function reserveStockForSale(
  warehouseId: string,
  items: { productId: string; qty: number }[],
  referenceId: string,
  userId: string
): Promise<InvMovement> {
  const movement = await pb.collection(INV_COLLECTIONS.movements).create<InvMovement>({
    movement_type: "OUT",
    status: "draft",
    warehouse: warehouseId,
    reference_type: "sales_order",
    reference_id: referenceId,
    created_by: userId,
    notes: `Reservasi stok untuk order ${referenceId}`,
  });

  for (const item of items) {
    await pb.collection(INV_COLLECTIONS.movementLines).create({
      movement: movement.id,
      product: item.productId,
      qty: item.qty,
    });
  }

  return movement;
}

/**
 * Creates incoming stock movement for a purchase order receipt.
 */
export async function createPurchaseReceipt(
  warehouseId: string,
  items: { productId: string; qty: number; unitCost?: number }[],
  referenceId: string,
  userId: string
): Promise<InvMovement> {
  const movement = await pb.collection(INV_COLLECTIONS.movements).create<InvMovement>({
    movement_type: "IN",
    status: "draft",
    warehouse: warehouseId,
    reference_type: "purchase_order",
    reference_id: referenceId,
    created_by: userId,
    notes: `Penerimaan dari PO ${referenceId}`,
  });

  for (const item of items) {
    await pb.collection(INV_COLLECTIONS.movementLines).create({
      movement: movement.id,
      product: item.productId,
      qty: item.qty,
      unit_cost: item.unitCost,
    });
  }

  return movement;
}
