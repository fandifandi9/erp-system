import { pb } from "@/lib/pocketbase";
import { fetchCompanyProfile } from "@/lib/bisnis/company-client";
import { TENANT_COLLECTIONS } from "./collections";
import type { ActivityEvent, EmitActivityInput } from "./types";

const MODULE_SEVERITY: Record<string, "info" | "success" | "warning"> = {
  "sales.order.created": "info",
  "sales.invoice.created": "success",
  "sales.payment.received": "success",
  "wms.picking.started": "info",
  "wms.picking.completed": "success",
  "wms.packing.completed": "success",
  "wms.awb.uploaded": "info",
  "wms.ready_pickup": "info",
  "wms.pickup.completed": "success",
  "sales.order.sent_wms": "info",
  "purchase.order.created": "info",
  "warehouse.receiving.completed": "success",
  "hr.attendance.checkin": "info",
  "hr.attendance.checkout": "info",
};

export async function emitBusinessEvent(input: EmitActivityInput): Promise<void> {
  try {
    const actorId = input.actor_id || (pb.authStore.model as { id?: string } | null)?.id;
    const company = await fetchCompanyProfile().catch(() => null);
    const severity = input.severity || MODULE_SEVERITY[input.event_code] || "info";
    await pb.collection(TENANT_COLLECTIONS.activityEvents).create({
      event_code: input.event_code,
      severity,
      module: input.module,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      entity_label: input.entity_label,
      actor: actorId,
      company: company?.id,
      store: input.store_id,
      warehouse: input.warehouse_id,
      payload_json: input.payload ? JSON.stringify(input.payload) : undefined,
      occurred_at: new Date().toISOString(),
      dedupe_key: input.dedupe_key,
    });
  } catch (err) {
    console.warn("emitBusinessEvent:", err);
  }
}

export async function fetchActivityEvents(opts?: {
  page?: number;
  perPage?: number;
  storeId?: string;
  warehouseId?: string;
  since?: string;
}): Promise<ActivityEvent[]> {
  const parts: string[] = [];
  if (opts?.storeId) parts.push(`store = "${opts.storeId}"`);
  if (opts?.warehouseId) parts.push(`warehouse = "${opts.warehouseId}"`);
  if (opts?.since) parts.push(`occurred_at >= "${opts.since}"`);
  const res = await pb.collection(TENANT_COLLECTIONS.activityEvents).getList(opts?.page ?? 1, opts?.perPage ?? 50, {
    sort: "-occurred_at",
    filter: parts.length ? parts.join(" && ") : undefined,
    expand: "actor,store,warehouse",
    requestKey: null,
  });
  return res.items as unknown as ActivityEvent[];
}
