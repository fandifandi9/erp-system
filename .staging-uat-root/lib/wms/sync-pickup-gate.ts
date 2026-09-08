import type PocketBase from "pocketbase";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { computePickupGate } from "./awb-pickup-gate";
import { parseOutboundWorkflow, serializeOutboundWorkflow } from "./outbound-workflow";

/** Sinkronkan pickup_gate di workflow untuk order yang sudah di ready_pickup. */
export async function syncPickupGateForOrder(
  soId: string,
  adminPb?: PocketBase,
): Promise<SalesOrder | null> {
  const client = adminPb ?? (await getInventoryAdminPb());
  const so = await client.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
    requestKey: null,
  });
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  if (wf.stage !== "ready_pickup") return null;
  const gate = computePickupGate(so);
  if (wf.pickup_gate === gate) return so;
  return client.collection(BISNIS_COLLECTIONS.salesOrders).update<SalesOrder>(soId, {
    outbound_workflow_json: serializeOutboundWorkflow({ ...wf, pickup_gate: gate }),
  });
}
