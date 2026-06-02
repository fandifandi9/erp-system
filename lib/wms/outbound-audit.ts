import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

/** Jejak picker / packing / pickup di inv_staff_activities. */
export async function logOutboundAudit(input: {
  userId: string;
  warehouseId: string;
  soId: string;
  orderNo: string;
  activityType: string;
  payload: Record<string, unknown>;
}) {
  try {
    await pb.collection(INV_COLLECTIONS.staffActivities).create({
      user: input.userId,
      warehouse: input.warehouseId,
      activity_type: input.activityType,
      entity_type: "biz_sales_orders",
      entity_id: input.soId,
      payload: {
        order_no: input.orderNo,
        ...input.payload,
      },
      occurred_at: new Date().toISOString(),
      device_platform: "web",
    });
  } catch {
    /* audit opsional */
  }
}

export type OutboundAuditSummary = {
  pick?: { at?: string; user_id?: string };
  validate?: { at?: string; position?: string };
  pack?: { at?: string };
  pickup?: { at?: string; driver_name?: string };
};

export async function fetchOutboundAuditForSo(soId: string): Promise<OutboundAuditSummary> {
  const types = [
    "wms.pick_complete",
    "wms.validate_complete",
    "wms.pack_complete",
    "wms.pickup_complete",
  ];
  const filter = types.map((t) => `activity_type = "${t}"`).join(" || ");
  try {
    const list = await pb.collection(INV_COLLECTIONS.staffActivities).getFullList({
      filter: `entity_id = "${soId}" && (${filter})`,
      sort: "occurred_at",
      requestKey: null,
    });
    const out: OutboundAuditSummary = {};
    for (const row of list) {
      const a = row as {
        activity_type: string;
        occurred_at?: string;
        user?: string;
        payload?: Record<string, unknown>;
      };
      if (a.activity_type === "wms.pick_complete") {
        out.pick = { at: a.occurred_at, user_id: a.user };
      }
      if (a.activity_type === "wms.validate_complete") {
        out.validate = {
          at: a.occurred_at,
          position: String(a.payload?.position ?? ""),
        };
      }
      if (a.activity_type === "wms.pack_complete") {
        out.pack = { at: a.occurred_at };
      }
      if (a.activity_type === "wms.pickup_complete") {
        out.pickup = {
          at: a.occurred_at,
          driver_name: String(a.payload?.driver_name ?? ""),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}
