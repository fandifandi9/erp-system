import { purchaseOrdersReceivingPbFilter } from "@/lib/bisnis/purchase-warehouse";
import { salesReturnsReceivingPbFilter } from "@/lib/bisnis/retur-workflow";
import { salesOrdersPickingPbFilter } from "@/lib/bisnis/sales-warehouse";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { cachedFetch } from "@/lib/catalog/stock-cache";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS, type InvStockBalance } from "@/lib/inventory/types";
import {
  isSoAwaitingPickup,
  isSoAwaitingPicking,
  isSoAwaitingValidation,
  isSoCancelled,
  isSoOutboundComplete,
} from "@/lib/wms/outbound-workflow";

export type WmsDashboardStockPreview = {
  id: string;
  qty_on_hand: number;
  product?: { sku?: string; name?: string };
  warehouse?: { name?: string };
};

export type WmsDashboardStats = {
  inboundQueue: number;
  lowStock: number;
  productSkus: number;
  outbound: { picking: number; validate: number; pickup: number; total: number };
  stockPreview: WmsDashboardStockPreview[];
};

function isActiveInWms(so: SalesOrder): boolean {
  if (isSoCancelled(so)) return false;
  if (isSoOutboundComplete(so)) return false;
  return !!so.send_to_warehouse_at;
}

async function computeStockMetrics(
  pb: Awaited<ReturnType<typeof getInventoryAdminPb>>,
): Promise<{ productSkus: number; lowStock: number }> {
  const balances = (await pb.collection(INV_COLLECTIONS.balances).getFullList({
    fields: "qty_on_hand,product",
    expand: "product",
    requestKey: null,
  })) as InvStockBalance[];

  const uniqueProducts = new Set<string>();
  let lowStock = 0;
  for (const b of balances) {
    const qty = b.qty_on_hand ?? 0;
    if (qty > 0 && b.product) uniqueProducts.add(String(b.product));
    const min = b.expand?.product?.min_stock ?? 0;
    if (min > 0 && qty < min) lowStock++;
  }
  return { productSkus: uniqueProducts.size, lowStock };
}

async function fetchStockPreview(
  pb: Awaited<ReturnType<typeof getInventoryAdminPb>>,
): Promise<WmsDashboardStockPreview[]> {
  const res = await pb.collection(INV_COLLECTIONS.balances).getList(1, 12, {
    filter: "qty_on_hand > 0",
    sort: "-updated",
    expand: "product,warehouse",
    requestKey: null,
  });
  return (res.items as unknown as InvStockBalance[]).map((b) => ({
    id: b.id,
    qty_on_hand: b.qty_on_hand ?? 0,
    product: b.expand?.product
      ? { sku: b.expand.product.sku, name: b.expand.product.name }
      : undefined,
    warehouse: b.expand?.warehouse ? { name: b.expand.warehouse.name } : undefined,
  }));
}

async function computeOutboundStats(
  pb: Awaited<ReturnType<typeof getInventoryAdminPb>>,
): Promise<WmsDashboardStats["outbound"]> {
  let items: SalesOrder[] = [];
  try {
    const res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 100, {
      filter: salesOrdersPickingPbFilter(),
      sort: "-created",
      fields: "id,send_to_warehouse_at,status,warehouse_process_status,outbound_workflow_json",
      requestKey: null,
    });
    items = res.items.filter(isActiveInWms);
  } catch {
    const res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 100, {
      filter: 'send_to_warehouse_at != "" && status != "cancelled"',
      sort: "-created",
      fields: "id,send_to_warehouse_at,status,warehouse_process_status,outbound_workflow_json",
      requestKey: null,
    });
    items = res.items.filter(isActiveInWms);
  }

  const picking = items.filter(isSoAwaitingPicking).length;
  const validate = items.filter(isSoAwaitingValidation).length;
  const pickup = items.filter(isSoAwaitingPickup).length;
  return { picking, validate, pickup, total: picking + validate + pickup };
}

export async function getWmsDashboardStatsServer(): Promise<WmsDashboardStats> {
  return cachedFetch(
    "wms:dashboard-stats",
    async () => {
      const pb = await getInventoryAdminPb();
      const [poRes, returRes, outbound, stockMetrics, stockPreview] = await Promise.all([
        pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getList(1, 1, {
          filter: purchaseOrdersReceivingPbFilter(),
          fields: "id",
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.returs).getList(1, 1, {
          filter: salesReturnsReceivingPbFilter(),
          fields: "id",
          requestKey: null,
        }),
        computeOutboundStats(pb),
        computeStockMetrics(pb),
        fetchStockPreview(pb),
      ]);

      return {
        inboundQueue: (poRes.totalItems ?? 0) + (returRes.totalItems ?? 0),
        lowStock: stockMetrics.lowStock,
        productSkus: stockMetrics.productSkus,
        outbound,
        stockPreview,
      };
    },
    30_000,
  );
}
