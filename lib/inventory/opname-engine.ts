import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { InvOpnameLine, InvOpnameSession } from "@/lib/inventory/types";
import { generateMovementNo } from "@/lib/inventory/stock-engine";
import { cleanMovementPayload } from "@/lib/inventory/pb-server";
import type { OpnameCountMethod } from "@/lib/inventory/types";

export function generateOpnameNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const t = String(d.getTime()).slice(-6);
  return `OPN-${y}${m}${day}-${t}`;
}

export async function createOpnameSession(
  pb: PocketBase,
  userId: string,
  input: {
    warehouse: string;
    count_method: OpnameCountMethod;
    notes?: string;
  }
): Promise<InvOpnameSession> {
  if (!input.warehouse) throw new Error("Gudang wajib.");

  const session = await pb.collection(INV_COLLECTIONS.opnameSessions).create({
    warehouse: input.warehouse,
    opname_no: generateOpnameNo(),
    status: "draft",
    count_method: input.count_method,
    started_by: userId,
    notes: input.notes || "",
    total_lines: 0,
    total_variance_qty: 0,
  });

  return session as unknown as InvOpnameSession;
}

export async function startOpnameCounting(
  pb: PocketBase,
  sessionId: string
): Promise<{ session: InvOpnameSession; lineCount: number }> {
  const session = (await pb
    .collection(INV_COLLECTIONS.opnameSessions)
    .getOne(sessionId)) as InvOpnameSession;

  if (session.status !== "draft" && session.status !== "counting") {
    throw new Error("Sesi opname tidak bisa dimulai dari status ini.");
  }

  const existing = await pb.collection(INV_COLLECTIONS.opnameLines).getFullList({
    filter: `session = "${sessionId}"`,
  });

  if (existing.length === 0) {
    const balances = await pb.collection(INV_COLLECTIONS.balances).getFullList({
      filter: `warehouse = "${session.warehouse}" && qty_on_hand > 0`,
      expand: "product",
    });

    for (const bal of balances) {
      const row = bal as unknown as { product: string; location?: string; qty_on_hand: number };
      await pb.collection(INV_COLLECTIONS.opnameLines).create({
        session: sessionId,
        product: row.product,
        location: row.location || "",
        system_qty: Number(row.qty_on_hand) || 0,
        counted_qty: 0,
        variance_qty: 0,
        line_status: "pending",
      });
    }
  }

  const lines = await pb.collection(INV_COLLECTIONS.opnameLines).getFullList({
    filter: `session = "${sessionId}"`,
  });

  const now = new Date().toISOString();
  const updated = await pb.collection(INV_COLLECTIONS.opnameSessions).update(sessionId, {
    status: "counting",
    count_started_at: session.count_started_at || now,
    total_lines: lines.length,
  });

  return {
    session: updated as unknown as InvOpnameSession,
    lineCount: lines.length,
  };
}

export async function getOpnameSessionDetail(pb: PocketBase, sessionId: string) {
  const session = await pb.collection(INV_COLLECTIONS.opnameSessions).getOne(sessionId, {
    expand: "warehouse,started_by,approved_by",
  });
  const lines = await pb.collection(INV_COLLECTIONS.opnameLines).getFullList({
    filter: `session = "${sessionId}"`,
    expand: "product,location",
    sort: "created",
  });
  return {
    session: session as unknown as InvOpnameSession,
    lines: lines as unknown as InvOpnameLine[],
  };
}

export async function submitOpnameLineCount(
  pb: PocketBase,
  sessionId: string,
  userId: string,
  input: { line_id: string; counted_qty: number }
): Promise<InvOpnameLine> {
  const session = (await pb
    .collection(INV_COLLECTIONS.opnameSessions)
    .getOne(sessionId)) as InvOpnameSession;

  if (session.status !== "counting") {
    throw new Error("Sesi opname tidak dalam fase penghitungan.");
  }

  const line = (await pb
    .collection(INV_COLLECTIONS.opnameLines)
    .getOne(input.line_id)) as InvOpnameLine;
  if (line.session !== sessionId) throw new Error("Baris tidak sesuai sesi.");

  const counted = Number(input.counted_qty);
  if (!Number.isFinite(counted) || counted < 0) {
    throw new Error("Qty hitung tidak valid.");
  }

  const systemQty = Number(line.system_qty) || 0;
  const variance = counted - systemQty;

  const updated = await pb.collection(INV_COLLECTIONS.opnameLines).update(input.line_id, {
    counted_qty: counted,
    variance_qty: variance,
    line_status: "counted",
    scanned_at: new Date().toISOString(),
    scanned_by: userId,
  });

  try {
    await pb.collection(INV_COLLECTIONS.staffActivities).create({
      user: userId,
      warehouse: session.warehouse,
      activity_type: "opname_count",
      payload: { session_id: sessionId, line_id: input.line_id, counted_qty: counted },
      occurred_at: new Date().toISOString(),
    });
  } catch {
    /* */
  }

  return updated as unknown as InvOpnameLine;
}

export async function submitOpnameForReview(
  pb: PocketBase,
  sessionId: string
): Promise<InvOpnameSession> {
  const { session, lines } = await getOpnameSessionDetail(pb, sessionId);
  if (session.status !== "counting") {
    throw new Error("Hanya sesi counting yang bisa diajukan review.");
  }

  const pending = lines.filter((l) => l.line_status !== "counted" && l.line_status !== "skipped");
  if (pending.length > 0) {
    throw new Error(`${pending.length} baris belum dihitung.`);
  }

  const totalVariance = lines.reduce((s, l) => s + (Number(l.variance_qty) || 0), 0);
  const now = new Date().toISOString();

  const updated = await pb.collection(INV_COLLECTIONS.opnameSessions).update(sessionId, {
    status: "review",
    count_ended_at: now,
    total_variance_qty: totalVariance,
    total_lines: lines.length,
  });

  return updated as unknown as InvOpnameSession;
}

export async function approveAndPostOpname(
  pb: PocketBase,
  adminPb: PocketBase,
  sessionId: string,
  approverUserId: string
): Promise<{ session: InvOpnameSession; movementId?: string }> {
  const { session, lines } = await getOpnameSessionDetail(pb, sessionId);
  if (session.status !== "review") {
    throw new Error("Sesi harus berstatus review sebelum disetujui.");
  }

  const varianceLines = lines.filter((l) => Number(l.variance_qty) !== 0);
  let movementId: string | undefined;

  if (varianceLines.length > 0) {
    const movement = await pb.collection(INV_COLLECTIONS.movements).create(
      cleanMovementPayload({
        movement_no: generateMovementNo(),
        movement_type: "ADJUSTMENT",
        status: "draft",
        warehouse: session.warehouse,
        reference_type: "OPNAME",
        reference_id: sessionId,
        notes: `Penyesuaian opname ${session.opname_no}`,
        created_by: approverUserId,
        device_platform: "api",
      })
    );

    for (const row of varianceLines) {
      await pb.collection(INV_COLLECTIONS.movementLines).create({
        movement: movement.id,
        product: row.product,
        qty: Number(row.variance_qty),
      });
    }

    await pb.collection(INV_COLLECTIONS.movements).update(movement.id, {
      status: "draft",
      total_qty: varianceLines.reduce((s, r) => s + Math.abs(Number(r.variance_qty) || 0), 0),
      line_count: varianceLines.length,
    });

    const { postStockMovement } = await import("@/lib/inventory/stock-engine");
    await postStockMovement(adminPb, movement.id, approverUserId);
    movementId = movement.id;
  }

  const now = new Date().toISOString();
  const updated = await pb.collection(INV_COLLECTIONS.opnameSessions).update(sessionId, {
    status: "posted",
    approved_by: approverUserId,
    posted_by: approverUserId,
    approved_at: now,
    posted_at: now,
    movement: movementId || "",
  });

  try {
    await pb.collection(INV_COLLECTIONS.opnameAdjustments).create({
      session: sessionId,
      movement: movementId || "",
      approved_by: approverUserId,
      approved_at: now,
      total_adjustment_qty: varianceLines.reduce(
        (s, r) => s + Math.abs(Number(r.variance_qty) || 0),
        0
      ),
    });
  } catch {
    /* optional collection */
  }

  return { session: updated as unknown as InvOpnameSession, movementId };
}
