import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { InvPackingChecklistLine, InvPackingSession } from "@/lib/inventory/types";
import { findProductByBarcode } from "@/lib/inventory/product-lookup";
import { getActiveZoneSession } from "@/lib/inventory/zone-engine";
import { generateMovementNo } from "@/lib/inventory/stock-engine";
import { cleanMovementPayload } from "@/lib/inventory/pb-server";

async function logActivity(
  pb: PocketBase,
  input: {
    userId: string;
    warehouseId: string;
    zoneId?: string;
    activityType: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await pb.collection(INV_COLLECTIONS.staffActivities).create({
      user: input.userId,
      warehouse: input.warehouseId,
      zone: input.zoneId || "",
      activity_type: input.activityType,
      payload: input.payload || {},
      occurred_at: new Date().toISOString(),
    });
  } catch {
    /* optional */
  }
}

export async function fetchPackingStations(pb: PocketBase, zoneId?: string) {
  const filter = zoneId ? `zone = "${zoneId}" && is_active = true` : "is_active = true";
  const res = await pb.collection(INV_COLLECTIONS.packingStations).getList(1, 100, {
    sort: "code",
    filter,
    expand: "zone,warehouse",
  });
  return res.items;
}

export async function createPackingSession(
  pb: PocketBase,
  userId: string,
  input: {
    packing_station_id: string;
    order_ref: string;
    order_source?: string;
    notes?: string;
    lines: { product: string; expected_qty: number }[];
    device_platform?: string;
  }
): Promise<InvPackingSession> {
  if (!input.lines.length) throw new Error("Minimal satu baris checklist.");
  if (!input.order_ref.trim()) throw new Error("Nomor order wajib.");

  const zoneSession = await getActiveZoneSession(pb, userId);
  if (!zoneSession) {
    throw new Error("Check-in zona packing dulu sebelum mulai sesi packing.");
  }

  const zone = (await pb.collection(INV_COLLECTIONS.zones).getOne(zoneSession.zone)) as {
    id: string;
    zone_type?: string;
    warehouse: string;
  };
  if (zone.zone_type !== "packing") {
    throw new Error("Sesi packing hanya bisa dimulai di zona tipe packing.");
  }

  const station = (await pb
    .collection(INV_COLLECTIONS.packingStations)
    .getOne(input.packing_station_id)) as { id: string; zone: string; warehouse: string };
  if (station.zone !== zone.id) {
    throw new Error("Meja packing tidak sesuai zona aktif.");
  }

  const existing = await pb.collection(INV_COLLECTIONS.packingSessions).getList(1, 1, {
    filter: `packed_by = "${userId}" && (status = "open" || status = "in_progress")`,
  });
  if (existing.items[0]) {
    throw new Error("Masih ada sesi packing aktif. Selesaikan dulu.");
  }

  const now = new Date().toISOString();
  const session = await pb.collection(INV_COLLECTIONS.packingSessions).create({
    warehouse: station.warehouse,
    zone: zone.id,
    zone_session: zoneSession.id,
    packing_station: station.id,
    order_ref: input.order_ref.trim(),
    order_source: input.order_source || "manual",
    status: "in_progress",
    started_at: now,
    packed_by: userId,
    device_platform: input.device_platform || "web",
    notes: input.notes || "",
  });

  for (const line of input.lines) {
    const qty = Number(line.expected_qty);
    if (!line.product || !Number.isFinite(qty) || qty <= 0) {
      throw new Error("Setiap baris wajib produk dan qty > 0.");
    }
    let sku = "";
    try {
      const p = (await pb.collection(INV_COLLECTIONS.products).getOne(line.product)) as {
        sku?: string;
      };
      sku = p.sku || "";
    } catch {
      /* */
    }
    await pb.collection(INV_COLLECTIONS.packingChecklistLines).create({
      packing_session: session.id,
      product: line.product,
      sku_snapshot: sku,
      expected_qty: qty,
      scanned_qty: 0,
      is_complete: false,
    });
  }

  await logActivity(pb, {
    userId,
    warehouseId: station.warehouse,
    zoneId: zone.id,
    activityType: "packing_scan",
    payload: { action: "session_start", order_ref: input.order_ref, session_id: session.id },
  });

  return session as unknown as InvPackingSession;
}

export async function getPackingSessionDetail(pb: PocketBase, sessionId: string) {
  const session = await pb.collection(INV_COLLECTIONS.packingSessions).getOne(sessionId, {
    expand: "warehouse,zone,packing_station,packed_by",
  });
  const lines = await pb.collection(INV_COLLECTIONS.packingChecklistLines).getFullList({
    filter: `packing_session = "${sessionId}"`,
    expand: "product",
    sort: "created",
  });
  return {
    session: session as unknown as InvPackingSession,
    lines: lines as unknown as InvPackingChecklistLine[],
  };
}

export async function scanPackingBarcode(
  pb: PocketBase,
  sessionId: string,
  userId: string,
  barcode: string
): Promise<{ line: InvPackingChecklistLine; productName: string }> {
  const session = (await pb
    .collection(INV_COLLECTIONS.packingSessions)
    .getOne(sessionId)) as InvPackingSession;
  if (session.packed_by !== userId) {
    throw new Error("Sesi packing bukan milik Anda.");
  }
  if (session.status === "completed" || session.status === "cancelled") {
    throw new Error("Sesi packing sudah ditutup.");
  }

  const product = await findProductByBarcode(pb, barcode);
  if (!product) throw new Error(`Produk tidak ditemukan: ${barcode}`);

  const lines = await pb.collection(INV_COLLECTIONS.packingChecklistLines).getFullList({
    filter: `packing_session = "${sessionId}" && product = "${product.id}"`,
    expand: "product",
  });
  const line = lines[0] as unknown as InvPackingChecklistLine | undefined;
  if (!line) {
    throw new Error(`Produk ${product.sku} tidak ada di checklist order ini.`);
  }

  const scanned = Number(line.scanned_qty) + 1;
  const expected = Number(line.expected_qty);
  const isComplete = scanned >= expected;

  const updated = await pb.collection(INV_COLLECTIONS.packingChecklistLines).update(line.id, {
    scanned_qty: scanned,
    is_complete: isComplete,
    last_scanned_at: new Date().toISOString(),
  });

  if (session.status === "open") {
    await pb.collection(INV_COLLECTIONS.packingSessions).update(sessionId, {
      status: "in_progress",
    });
  }

  await logActivity(pb, {
    userId,
    warehouseId: session.warehouse,
    zoneId: session.zone,
    activityType: "packing_scan",
    payload: {
      session_id: sessionId,
      product_id: product.id,
      sku: product.sku,
      scanned_qty: scanned,
    },
  });

  return {
    line: updated as unknown as InvPackingChecklistLine,
    productName: product.name,
  };
}

export async function completePackingSession(
  pb: PocketBase,
  sessionId: string,
  userId: string,
  opts?: { postOut?: boolean; adminPb?: PocketBase }
): Promise<{ session: InvPackingSession; movementId?: string }> {
  const { session, lines } = await getPackingSessionDetail(pb, sessionId);
  if (session.packed_by !== userId && !opts?.adminPb) {
    throw new Error("Sesi packing bukan milik Anda.");
  }
  if (session.status === "completed") return { session };

  const incomplete = lines.filter((l) => !l.is_complete);
  if (incomplete.length > 0) {
    throw new Error(`${incomplete.length} baris belum lengkap. Scan semua item dulu.`);
  }

  let movementId: string | undefined;
  if (opts?.postOut && opts.adminPb) {
    const outLines = lines
      .filter((l) => Number(l.scanned_qty) > 0)
      .map((l) => ({ product: l.product, qty: -Math.abs(Number(l.scanned_qty)) }));

    if (outLines.length > 0) {
      const movement = await pb.collection(INV_COLLECTIONS.movements).create(
        cleanMovementPayload({
          movement_no: generateMovementNo(),
          movement_type: "OUT",
          status: "draft",
          warehouse: session.warehouse,
          reference_type: "PACKING",
          reference_id: sessionId,
          notes: `Auto OUT packing order ${session.order_ref}`,
          created_by: userId,
          device_platform: "api",
        })
      );
      for (const row of outLines) {
        await pb.collection(INV_COLLECTIONS.movementLines).create({
          movement: movement.id,
          product: row.product,
          qty: row.qty,
        });
      }
      await pb.collection(INV_COLLECTIONS.movements).update(movement.id, {
        status: "draft",
        total_qty: outLines.reduce((s, r) => s + Math.abs(r.qty), 0),
        line_count: outLines.length,
      });
      const { postStockMovement } = await import("@/lib/inventory/stock-engine");
      await postStockMovement(opts.adminPb, movement.id, userId);
      movementId = movement.id;
    }
  }

  const now = new Date().toISOString();
  const updated = await pb.collection(INV_COLLECTIONS.packingSessions).update(sessionId, {
    status: "completed",
    completed_at: now,
    movement: movementId || "",
  });

  await logActivity(pb, {
    userId,
    warehouseId: session.warehouse,
    zoneId: session.zone,
    activityType: "packing_complete",
    payload: { session_id: sessionId, movement_id: movementId },
  });

  return { session: updated as unknown as InvPackingSession, movementId };
}
