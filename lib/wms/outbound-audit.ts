import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { emitBusinessEvent } from "@/lib/tenant/activity-events";
import { STAFF_ACTIVITY_TO_BUSINESS } from "@/lib/tenant/event-labels";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

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

  const businessCode = STAFF_ACTIVITY_TO_BUSINESS[input.activityType];
  if (businessCode) {
    void (async () => {
      let storeId: string | undefined;
      try {
        const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne(input.soId, {
          fields: "store",
        });
        storeId = (so as { store?: string }).store;
      } catch {
        /* optional */
      }
      await emitBusinessEvent({
        event_code: businessCode,
        module: "warehouse",
        entity_type: "biz_sales_orders",
        entity_id: input.soId,
        entity_label: input.orderNo,
        store_id: storeId,
        warehouse_id: input.warehouseId,
        payload: { order_no: input.orderNo, ...input.payload },
        actor_id: input.userId,
        dedupe_key: `${businessCode}:${input.soId}`,
      });
    })();
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
    "wms.validate_pack_complete",
    "wms.pack_complete",
    "wms.pickup_complete",
    "wms.order_cancelled",
    "wms.validation_failed",
    "wms.return_to_picking",
    "wms.cancel_shipment",
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
      const a = row as unknown as {
        activity_type: string;
        occurred_at?: string;
        user?: string;
        payload?: Record<string, unknown>;
      };
      if (a.activity_type === "wms.pick_complete") {
        out.pick = { at: a.occurred_at, user_id: a.user };
      }
      if (
        a.activity_type === "wms.validate_complete" ||
        a.activity_type === "wms.validate_pack_complete"
      ) {
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
