/**
 * PATCH /api/notifications/[id]/read
 * Mark a notification as read.
 * SECURITY: verifies the notification belongs to the authenticated user before updating.
 */
import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { getAuthenticatedHrUser, hrJsonError, HrApiError } from "@/lib/hr/api-auth";

const COLLECTION = "notifications";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    if (!id?.trim()) {
      throw new HrApiError("ID notifikasi wajib.", 400);
    }

    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }

    const adminPb = await getInventoryAdminPb();

    // SECURITY: fetch first to verify ownership
    let record: { id: string; recipient: string; read_at?: string };
    try {
      record = await adminPb.collection(COLLECTION).getOne(id.trim(), {
        requestKey: null,
      }) as typeof record;
    } catch {
      throw new HrApiError("Notifikasi tidak ditemukan.", 404);
    }

    if (record.recipient !== ctx.userId) {
      throw new HrApiError("Akses ditolak.", 403);
    }

    // Idempotent: skip if already read
    if (record.read_at) {
      return NextResponse.json({ ok: true, message: "Sudah dibaca.", id: record.id });
    }

    await adminPb.collection(COLLECTION).update(id.trim(), {
      read_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, message: "Notifikasi ditandai dibaca.", id });
  } catch (err) {
    return hrJsonError(err, "Gagal menandai notifikasi.");
  }
}
