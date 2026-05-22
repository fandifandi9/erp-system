import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { InvZone, InvZoneSession } from "@/lib/inventory/types";
import { parseZoneQrPayload } from "@/lib/inventory/zone-qr";

type ZoneRow = InvZone & { id: string; is_active?: boolean };

export async function findZoneByQrPayload(
  pb: PocketBase,
  qrPayload: string
): Promise<ZoneRow | null> {
  const raw = qrPayload.trim();
  const esc = raw.replace(/"/g, '\\"');

  try {
    const byPayload = await pb.collection(INV_COLLECTIONS.zones).getList(1, 1, {
      filter: `qr_payload = "${esc}"`,
    });
    if (byPayload.items[0]) return byPayload.items[0] as unknown as ZoneRow;
  } catch {
    /* fallback parse */
  }

  const parsed = parseZoneQrPayload(raw);
  if (!parsed) return null;

  try {
    const whList = await pb.collection(INV_COLLECTIONS.warehouses).getList(1, 1, {
      filter: `code = "${parsed.warehouseCode.replace(/"/g, '\\"')}"`,
    });
    const wh = whList.items[0] as { id: string } | undefined;
    if (!wh?.id) return null;

    const zoneList = await pb.collection(INV_COLLECTIONS.zones).getList(1, 1, {
      filter: `warehouse = "${wh.id}" && code = "${parsed.zoneCode.replace(/"/g, '\\"')}"`,
    });
    return (zoneList.items[0] as unknown as ZoneRow) || null;
  } catch {
    return null;
  }
}

export async function findZoneById(pb: PocketBase, zoneId: string): Promise<ZoneRow | null> {
  try {
    return (await pb.collection(INV_COLLECTIONS.zones).getOne(zoneId, {
      expand: "warehouse",
    })) as unknown as ZoneRow;
  } catch {
    return null;
  }
}

export async function getActiveZoneSession(
  pb: PocketBase,
  userId: string
): Promise<InvZoneSession | null> {
  try {
    const list = await pb.collection(INV_COLLECTIONS.zoneSessions).getList(1, 1, {
      filter: `user = "${userId}" && status = "active"`,
      sort: "-check_in_at",
      expand: "zone,warehouse,user",
    });
    return (list.items[0] as unknown as InvZoneSession) || null;
  } catch {
    return null;
  }
}

async function logStaffActivity(
  pb: PocketBase,
  input: {
    userId: string;
    warehouseId: string;
    zoneId?: string;
    zoneSessionId?: string;
    activityType: string;
    payload?: Record<string, unknown>;
    devicePlatform?: string;
  }
): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      user: input.userId,
      warehouse: input.warehouseId,
      activity_type: input.activityType,
      payload: input.payload || {},
      occurred_at: new Date().toISOString(),
    };
    if (input.zoneId) row.zone = input.zoneId;
    if (input.zoneSessionId) row.zone_session = input.zoneSessionId;
    await pb.collection(INV_COLLECTIONS.staffActivities).create(row);
  } catch {
    /* aktivitas opsional */
  }
}

async function closeActiveSessionsInWarehouse(
  pb: PocketBase,
  userId: string,
  warehouseId: string,
  reason: string
): Promise<void> {
  const list = await pb.collection(INV_COLLECTIONS.zoneSessions).getFullList({
    filter: `user = "${userId}" && warehouse = "${warehouseId}" && status = "active"`,
  });
  const now = new Date().toISOString();
  for (const row of list) {
    await pb.collection(INV_COLLECTIONS.zoneSessions).update(row.id, {
      status: "closed",
      check_out_at: now,
      closed_reason: reason,
    });
  }
}

export async function checkInZone(
  pb: PocketBase,
  userId: string,
  zone: ZoneRow,
  opts?: { devicePlatform?: string; viaQr?: boolean }
): Promise<InvZoneSession> {
  if (zone.is_active === false) {
    throw new Error("Zona tidak aktif.");
  }

  await closeActiveSessionsInWarehouse(
    pb,
    userId,
    zone.warehouse,
    "auto_close_checkin_new_zone"
  );

  const session = await pb.collection(INV_COLLECTIONS.zoneSessions).create({
    user: userId,
    warehouse: zone.warehouse,
    zone: zone.id,
    status: "active",
    check_in_at: new Date().toISOString(),
  });

  await logStaffActivity(pb, {
    userId,
    warehouseId: zone.warehouse,
    zoneId: zone.id,
    zoneSessionId: session.id,
    activityType: opts?.viaQr ? "scan_zone_qr" : "zone_checkin",
    devicePlatform: opts?.devicePlatform,
    payload: {
      zone_code: zone.code,
      zone_type: zone.zone_type,
      qr_payload: zone.qr_payload,
    },
  });

  return session as unknown as InvZoneSession;
}

export async function checkOutZone(
  pb: PocketBase,
  sessionId: string,
  userId: string,
  opts?: { forced?: boolean; reason?: string; devicePlatform?: string }
): Promise<InvZoneSession> {
  const session = (await pb
    .collection(INV_COLLECTIONS.zoneSessions)
    .getOne(sessionId, { expand: "zone,warehouse" })) as unknown as InvZoneSession;

  if (session.user !== userId && !opts?.forced) {
    throw new Error("Session bukan milik Anda.");
  }
  if (session.status !== "active") {
    return session;
  }

  const now = new Date().toISOString();
  const updated = await pb.collection(INV_COLLECTIONS.zoneSessions).update(sessionId, {
    status: opts?.forced ? "forced_closed" : "closed",
    check_out_at: now,
    closed_reason: opts?.reason || (opts?.forced ? "forced_by_supervisor" : "checkout"),
  });

  await logStaffActivity(pb, {
    userId: session.user,
    warehouseId: session.warehouse,
    zoneId: session.zone,
    zoneSessionId: sessionId,
    activityType: "zone_checkout",
    devicePlatform: opts?.devicePlatform,
    payload: { closed_reason: opts?.reason },
  });

  return updated as unknown as InvZoneSession;
}

export async function resolveZoneFromInput(
  pb: PocketBase,
  input: { qr_payload?: string; zone_id?: string }
): Promise<ZoneRow> {
  if (input.zone_id) {
    const z = await findZoneById(pb, input.zone_id);
    if (!z) throw new Error("Zona tidak ditemukan.");
    return z;
  }
  if (input.qr_payload?.trim()) {
    const z = await findZoneByQrPayload(pb, input.qr_payload.trim());
    if (!z) {
      throw new Error(
        "QR zona tidak dikenali. Pastikan zona sudah dibuat di menu Zona dan gunakan payload QR yang ditampilkan (bukan contoh RECEIVING jika kode zona berbeda)."
      );
    }
    return z;
  }
  throw new Error("qr_payload atau zone_id wajib.");
}
