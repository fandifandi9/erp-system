import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { serverDeleteOffice, serverUpdateOffice } from "@/lib/hr/office-server";

type RouteCtx = { params: Promise<{ id: string }> };

/** PATCH /api/hr/offices/[id] — update office (Owner / HR FULL). */
export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireOwnerOrHrApiUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const adminPb = await getInventoryAdminPb();
    const record = await serverUpdateOffice(adminPb, authCtx, id, {
      name: body.name != null ? String(body.name) : undefined,
      lat: body.lat != null ? Number(body.lat) : undefined,
      lng: body.lng != null ? Number(body.lng) : undefined,
      radius: body.radius != null ? Number(body.radius) : undefined,
      is_active: typeof body.is_active === "boolean" ? body.is_active : undefined,
      address: body.address != null ? String(body.address) : undefined,
      max_checkin_distance:
        body.max_checkin_distance != null ? Number(body.max_checkin_distance) : undefined,
      timezone: body.timezone != null ? String(body.timezone) : undefined,
    });
    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** DELETE /api/hr/offices/[id] — Owner only. */
export async function DELETE(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireOwnerOrHrApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    await serverDeleteOffice(adminPb, authCtx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hrJsonError(err);
  }
}
