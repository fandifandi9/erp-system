import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { salesOrdersPickingPbFilter } from "@/lib/bisnis/sales-warehouse";
import { getErrorMessage } from "@/lib/errors";
import {
  getOutboundStageFromSo,
  isSoAwaitingPickup,
  isSoAwaitingPicking,
  isSoAwaitingValidation,
  isSoCancelled,
  isSoOutboundComplete,
  WMS_STAGE_UI,
  type WmsOrderStage,
} from "./outbound-workflow";
import { getPackageIdentityView } from "./package-identity";
import { getPkIdentityView } from "./pk-identity";
import { formatWmsStageWaitLine, type WmsTimeDisplayMode } from "./wms-queue-time";
import { getPickupGateFromWorkflow, PICKUP_GATE_UI, type PickupGate } from "./awb-pickup-gate";
import { parseOutboundWorkflow } from "./outbound-workflow";

export {
  isSoAwaitingPicking,
  isSoAwaitingValidation,
  isSoAwaitingPickup,
  isSoOutboundComplete,
};

export function salesOrdersOutboundPbFilter(): string {
  return salesOrdersPickingPbFilter();
}

export function salesOrdersCompletedPbFilter(): string {
  return (
    'send_to_warehouse_at != "" && (status = "delivered" || warehouse_process_status = "complete")'
  );
}

function isActiveInWms(so: SalesOrder): boolean {
  if (isSoCancelled(so)) return false;
  if (isSoOutboundComplete(so)) return false;
  return !!so.send_to_warehouse_at;
}

export async function fetchOutboundOrdersForQueues(
  mode: "active" | "completed",
): Promise<SalesOrder[]> {
  const now = Date.now();
  if (mode === "active" && activeQueueCache && now - activeQueueCache.at < ACTIVE_QUEUE_CACHE_MS) {
    return activeQueueCache.data;
  }

  const filter = mode === "completed" ? salesOrdersCompletedPbFilter() : salesOrdersOutboundPbFilter();
  try {
    const res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 100, {
      filter,
      sort: "-created",
      expand: "warehouse,customer,store",
      requestKey: null,
    });
    const items = mode === "active" ? res.items.filter(isActiveInWms) : res.items;
    if (mode === "active") {
      activeQueueCache = { at: now, data: items };
    }
    return items;
  } catch {
    const res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 100, {
      filter: 'send_to_warehouse_at != "" && status != "cancelled"',
      sort: "-created",
      expand: "warehouse,customer,store",
      requestKey: null,
    });
    const items = mode === "active" ? res.items.filter(isActiveInWms) : res.items;
    if (mode === "active") {
      activeQueueCache = { at: now, data: items };
    }
    return items;
  }
}

const ACTIVE_QUEUE_CACHE_MS = 20_000;
let activeQueueCache: { at: number; data: SalesOrder[] } | null = null;

export function invalidateOutboundQueueCache(): void {
  activeQueueCache = null;
}

export function queueLabelForStage(stage: WmsOrderStage): string {
  return WMS_STAGE_UI[stage]?.label ?? stage;
}

export function sortQueueOrders(orders: SalesOrder[]): SalesOrder[] {
  return [...orders].sort((a, b) => {
    const deskA =
      parseOutboundWorkflow(a.outbound_workflow_json).desk_request?.status === "pending" ? 0 : 1;
    const deskB =
      parseOutboundWorkflow(b.outbound_workflow_json).desk_request?.status === "pending" ? 0 : 1;
    if (deskA !== deskB) return deskA - deskB;
    const ta = a.warehouse_processed_at || a.created || "";
    const tb = b.warehouse_processed_at || b.created || "";
    return tb.localeCompare(ta);
  });
}

export async function loadPickingQueue(): Promise<SalesOrder[]> {
  const all = await fetchOutboundOrdersForQueues("active");
  return sortQueueOrders(all.filter(isSoAwaitingPicking));
}

export async function loadValidateQueue(): Promise<SalesOrder[]> {
  const all = await fetchOutboundOrdersForQueues("active");
  return sortQueueOrders(all.filter(isSoAwaitingValidation));
}

export async function loadPickupQueue(): Promise<SalesOrder[]> {
  const all = await fetchOutboundOrdersForQueues("active");
  return sortQueueOrders(all.filter(isSoAwaitingPickup));
}

export async function loadCompleteQueue(): Promise<SalesOrder[]> {
  try {
    const all = await fetchOutboundOrdersForQueues("completed");
    return sortQueueOrders(all.filter(isSoOutboundComplete));
  } catch (e) {
    throw new Error(getErrorMessage(e, "Gagal memuat daftar selesai"));
  }
}

export type OutboundQueueStats = {
  picking: number;
  validate: number;
  pickup: number;
  total: number;
};

export async function loadOutboundQueueStats(): Promise<OutboundQueueStats> {
  const all = await fetchOutboundOrdersForQueues("active");
  const picking = all.filter(isSoAwaitingPicking).length;
  const validate = all.filter(isSoAwaitingValidation).length;
  const pickup = all.filter(isSoAwaitingPickup).length;
  return { picking, validate, pickup, total: picking + validate + pickup };
}

export function describeOrderForQueue(
  so: SalesOrder,
  opts?: { nowMs?: number; timeMode?: WmsTimeDisplayMode },
): {
  stage: WmsOrderStage;
  pkNo: string;
  orderNo: string;
  /** Invoice jika sudah digenerate (setelah picking); kosong = masih SO. */
  invoiceNo: string;
  packageCode: string;
  packageCodeType: "awb" | "internal";
  storeName: string;
  stageWaitLine: string;
  pickupGate: PickupGate | null;
  pickupGateLabel: string | null;
  pkPrinted: boolean;
  deskRequestPending: boolean;
  deskRequesterName: string | null;
} {
  const pkg = getPackageIdentityView(so);
  const pk = getPkIdentityView(so);
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const gate = getPickupGateFromWorkflow(wf);
  const deskPending = wf.desk_request?.status === "pending";
  return {
    stage: getOutboundStageFromSo(so),
    pkNo: pk.pkNo,
    orderNo: so.order_no,
    invoiceNo: wf.order_meta?.invoice_no?.trim() || "",
    packageCode: pkg.code,
    packageCodeType: pkg.type,
    storeName:
      wf.order_meta?.store_name?.trim() ||
      so.expand?.store?.name?.trim() ||
      "—",
    stageWaitLine: formatWmsStageWaitLine(so, {
      nowMs: opts?.nowMs,
      mode: opts?.timeMode,
    }),
    pickupGate: gate,
    pickupGateLabel: gate ? PICKUP_GATE_UI[gate].label : null,
    pkPrinted: !!wf.pk_printed_at,
    deskRequestPending: deskPending,
    deskRequesterName: deskPending ? wf.desk_request?.requester_name?.trim() || null : null,
  };
}
