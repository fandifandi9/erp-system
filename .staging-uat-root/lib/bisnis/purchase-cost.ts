import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

export type LastPurchaseCost = {
  unit_cost: number;
  po_no?: string;
  order_date?: string;
  warehouse_id?: string;
};

/**
 * Harga modal = unit_cost pembelian terakhir (bukan harga jual master).
 * Opsional filter per gudang (warehouse PO).
 */
export async function fetchLastPurchaseUnitCosts(
  warehouseId?: string,
): Promise<Record<string, LastPurchaseCost>> {
  let lineFilter = "";

  if (warehouseId) {
    const pos = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getFullList({
      filter: `warehouse = "${warehouseId}" && status != "cancelled"`,
      fields: "id",
      requestKey: null,
    });
    const poIds = pos.map((p) => String((p as { id: string }).id));
    if (poIds.length === 0) return {};
    lineFilter = poIds.map((id) => `purchase_order = "${id}"`).join(" || ");
  }

  const lines = await pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).getFullList({
    filter: lineFilter || undefined,
    sort: "-created",
    expand: "purchase_order",
    requestKey: null,
  });

  const map: Record<string, LastPurchaseCost> = {};

  for (const row of lines) {
    const line = row as unknown as {
      product: string;
      unit_cost: number;
      expand?: {
        purchase_order?: {
          status?: string;
          po_no?: string;
          order_date?: string;
          warehouse?: string;
        };
      };
    };
    if (!line.product || map[line.product]) continue;

    const po = line.expand?.purchase_order;
    if (!po || po.status === "cancelled") continue;
    if (warehouseId && po.warehouse && po.warehouse !== warehouseId) continue;

    map[line.product] = {
      unit_cost: Number(line.unit_cost) || 0,
      po_no: po.po_no,
      order_date: po.order_date,
      warehouse_id: po.warehouse,
    };
  }

  return map;
}
