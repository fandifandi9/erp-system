import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import {
  serverGetSelfProfile,
  serverUpdateSelfProfile,
} from "@/lib/hr/profile-mutation-server";

/** GET /api/profile/self — safe self profile (no sensitive fields). */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const adminPb = await getInventoryAdminPb();
    const profile = await serverGetSelfProfile(adminPb, ctx.userId);
    return NextResponse.json({ ok: true, data: profile });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** PATCH /api/profile/self — allowlisted self-service fields only. */
export async function PATCH(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const adminPb = await getInventoryAdminPb();
    const profile = await serverUpdateSelfProfile(adminPb, ctx.userId, body);
    return NextResponse.json({ ok: true, data: profile });
  } catch (err) {
    if (err instanceof Error && err.message.includes("tidak boleh diubah")) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    return hrJsonError(err);
  }
}
