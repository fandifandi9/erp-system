import { formatActivityEventLabel, type Locale } from "@/lib/i18n";

/** @deprecated Gunakan formatActivityEventLabel(locale, ...) */
export function formatActivityLabel(
  eventCode: string,
  payload?: Record<string, unknown>,
  entityLabel?: string,
  locale: Locale = "id",
): string {
  return formatActivityEventLabel(locale, eventCode, payload, entityLabel);
}

/** Map staff activity → business event (Tier 1 feed). */
export const STAFF_ACTIVITY_TO_BUSINESS: Record<string, string | undefined> = {
  "wms.pick_task": "wms.picking.started",
  "wms.pick_complete": "wms.picking.completed",
  "wms.validate_complete": "wms.packing.completed",
  "wms.validate_pack_complete": "wms.packing.completed",
  "wms.pack_complete": "wms.packing.completed",
  "wms.pickup_complete": "wms.pickup.completed",
  "wms.receive_complete": "warehouse.receiving.completed",
};
