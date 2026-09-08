import {
  isReturInWmsInboundQueue,
  isReturOnWmsHold,
  purchaseReturnsReceivingPbFilter,
  salesReturnsReceivingPbFilter,
  salesReturnsWmsHoldPbFilter,
} from "@/lib/bisnis/retur-workflow";
import { purchaseOrdersReceivingPbFilter } from "@/lib/bisnis/purchase-warehouse";
import { BISNIS_COLLECTIONS, type PurchaseOrder, type Retur } from "@/lib/bisnis/types";
import { cachedFetch, invalidateStockCache } from "@/lib/catalog/stock-cache";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";

export type InboundQueuePayload = {
  orders: PurchaseOrder[];
  salesReturns: Retur[];
  purchaseReturns: Retur[];
  /** Retur penjualan hold (WMS bantah) — tunggu putusan bisnis. */
  heldSalesReturns: Retur[];
};

export async function getInboundQueueServer(): Promise<InboundQueuePayload> {
  return cachedFetch(
    "wms:inbound-queue",
    async () => {
      const pb = await getInventoryAdminPb();
      const [poRes, salesRetRes, purchaseRetRes, holdRes] = await Promise.all([
        pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getList<PurchaseOrder>(1, 50, {
          filter: purchaseOrdersReceivingPbFilter(),
          expand: "supplier,warehouse,created_by,warehouse_processed_by",
          sort: "-send_to_warehouse_at",
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, 50, {
          filter: salesReturnsReceivingPbFilter(),
          expand: "warehouse,customer,invoice,sales_order",
          sort: "-created",
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, 50, {
          filter: purchaseReturnsReceivingPbFilter(),
          expand: "warehouse,supplier",
          sort: "-created",
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, 50, {
          filter: salesReturnsWmsHoldPbFilter(),
          expand: "warehouse,customer,invoice,sales_order",
          sort: "-wms_received_at,-updated",
          requestKey: null,
        }),
      ]);

      return {
        orders: poRes.items,
        salesReturns: salesRetRes.items.filter(isReturInWmsInboundQueue),
        purchaseReturns: purchaseRetRes.items.filter(isReturInWmsInboundQueue),
        heldSalesReturns: holdRes.items.filter(isReturOnWmsHold),
      };
    },
    30_000,
  );
}

export function invalidateInboundQueueCache(): void {
  invalidateStockCache("wms:inbound-queue");
}
