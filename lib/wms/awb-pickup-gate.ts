import type { SalesOrder } from "@/lib/bisnis/types";
import { hasAwbLabelFile } from "@/lib/bisnis/awb-label";
import type { OutboundWorkflow } from "./outbound-workflow";
import { isWmsShipFulfillment } from "./fulfillment-mode";

export type PickupGate = "menunggu_awb" | "siap_serah";

export function shipmentRequiresAwb(
  so: Pick<SalesOrder, "notes">,
): boolean {
  return isWmsShipFulfillment(so);
}

export function computePickupGate(
  so: Pick<SalesOrder, "notes" | "awb_label">,
): PickupGate {
  if (!shipmentRequiresAwb(so)) return "siap_serah";
  return hasAwbLabelFile(so) ? "siap_serah" : "menunggu_awb";
}

export function getPickupGateFromWorkflow(wf: OutboundWorkflow): PickupGate | null {
  return wf.pickup_gate ?? null;
}

export function pickupGateBlocksHandover(
  so: Pick<SalesOrder, "notes" | "awb_label" | "outbound_workflow_json">,
  wf?: OutboundWorkflow,
): boolean {
  const gate = wf?.pickup_gate ?? computePickupGate(so);
  return gate === "menunggu_awb";
}

export const PICKUP_GATE_UI: Record<PickupGate, { label: string; cls: string }> = {
  menunggu_awb: { label: "Menunggu AWB", cls: "bg-amber-100 text-amber-900" },
  siap_serah: { label: "Siap serah kurir", cls: "bg-emerald-100 text-emerald-800" },
};
