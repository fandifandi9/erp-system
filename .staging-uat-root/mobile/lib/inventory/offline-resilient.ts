import { zoneCheckIn, zoneCheckOut } from "@/lib/inventory/api";
import { isRetriableTransportError } from "@/lib/network";
import { enqueueOfflineItem } from "@/lib/offline-queue/enqueue";

export async function zoneCheckInOrQueue(input: {
  qr_payload?: string;
  zone_id?: string;
}): Promise<{ ok: true; queued: false; data?: unknown } | { ok: true; queued: true }> {
  try {
    const data = await zoneCheckIn(input);
    return { ok: true, queued: false, data };
  } catch (e: unknown) {
    if (isRetriableTransportError(e)) {
      const keyPart = String(input.qr_payload || input.zone_id || "na").trim().slice(0, 240);
      await enqueueOfflineItem({
        type: "inventory_zone_checkin",
        payload: {
          qr_payload: input.qr_payload,
          zone_id: input.zone_id,
        },
        idempotency_key: `zone_ci_${keyPart}`,
      });
      return { ok: true, queued: true };
    }
    throw e;
  }
}

export async function zoneCheckOutOrQueue(sessionId?: string): Promise<
  { ok: true; queued: false } | { ok: true; queued: true }
> {
  try {
    await zoneCheckOut(sessionId);
    return { ok: true, queued: false };
  } catch (e: unknown) {
    if (isRetriableTransportError(e)) {
      const sid = sessionId?.trim() || "";
      await enqueueOfflineItem({
        type: "inventory_zone_checkout",
        payload: { session_id: sessionId },
        idempotency_key: sid ? `zone_co_${sid}` : `zone_co_open_${Date.now()}`,
      });
      return { ok: true, queued: true };
    }
    throw e;
  }
}
