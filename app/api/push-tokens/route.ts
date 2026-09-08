/**
 * POST /api/push-tokens
 * Register or update an Expo push token for the authenticated user.
 *
 * Multi-device: each device_id gets its own token record.
 * If device_id is provided and a token for that device already exists, it is updated.
 * If no device_id, deduplicates by token value.
 *
 * SECURITY: user can only register tokens for themselves.
 * Token format validated (ExponentPushToken[...]).
 */
import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { getAuthenticatedHrUser, hrJsonError, HrApiError } from "@/lib/hr/api-auth";
import { isValidExpoPushToken } from "@/lib/notifications/push";

const COLLECTION = "push_tokens";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const token = String(body.token ?? "").trim();
    const platform = String(body.platform ?? "android").trim() as "android" | "ios";
    const device_id = String(body.device_id ?? "").trim();

    if (!token) {
      throw new HrApiError("Token wajib diisi.", 400);
    }
    if (!isValidExpoPushToken(token)) {
      throw new HrApiError("Format token tidak valid. Harus berformat ExponentPushToken[...].", 400);
    }
    if (!["android", "ios"].includes(platform)) {
      throw new HrApiError("Platform harus android atau ios.", 400);
    }

    const adminPb = await getInventoryAdminPb();
    const now = new Date().toISOString();

    // Look for existing token: by device_id (if provided) or by token value
    const filterByDevice = device_id
      ? `user = "${pbEscape(ctx.userId)}" && device_id = "${pbEscape(device_id)}"`
      : `user = "${pbEscape(ctx.userId)}" && token = "${pbEscape(token)}"`;

    const existing = await adminPb.collection(COLLECTION).getList(1, 1, {
      filter: filterByDevice,
      requestKey: null,
    });

    if (existing.items.length > 0) {
      const existingId = existing.items[0].id;
      await adminPb.collection(COLLECTION).update(existingId, {
        token,
        platform,
        is_active: true,
        last_seen: now,
      });
      return NextResponse.json({ ok: true, message: "Token diperbarui.", id: existingId });
    }

    const created = await adminPb.collection(COLLECTION).create({
      user: ctx.userId,
      token,
      platform,
      device_id: device_id || "",
      is_active: true,
      last_seen: now,
    });

    return NextResponse.json({ ok: true, message: "Token didaftarkan.", id: created.id });
  } catch (err) {
    return hrJsonError(err, "Gagal mendaftarkan push token.");
  }
}

/**
 * DELETE /api/push-tokens
 * Deactivate the token for this user (on logout or permission revoked).
 * Requires token value in body. Does NOT delete — marks is_active = false.
 */
export async function DELETE(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const token = String(body.token ?? "").trim();
    const device_id = String(body.device_id ?? "").trim();

    if (!token && !device_id) {
      throw new HrApiError("Token atau device_id wajib diisi.", 400);
    }

    const adminPb = await getInventoryAdminPb();

    const filter = device_id
      ? `user = "${pbEscape(ctx.userId)}" && device_id = "${pbEscape(device_id)}"`
      : `user = "${pbEscape(ctx.userId)}" && token = "${pbEscape(token)}"`;

    const existing = await adminPb.collection(COLLECTION).getList(1, 5, {
      filter,
      requestKey: null,
    });

    let deactivated = 0;
    for (const record of existing.items) {
      await adminPb.collection(COLLECTION).update(record.id, { is_active: false });
      deactivated++;
    }

    return NextResponse.json({ ok: true, message: `${deactivated} token dinonaktifkan.` });
  } catch (err) {
    return hrJsonError(err, "Gagal menonaktifkan token.");
  }
}
