import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { serverCreateOffice, serverListOffices } from "@/lib/hr/office-server";

/** GET /api/hr/offices — list offices (operational HR actor). */
export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const adminPb = await getInventoryAdminPb();
    const items = await serverListOffices(adminPb, ctx);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/hr/offices — create office (Owner / HR FULL). */
export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const adminPb = await getInventoryAdminPb();
    const record = await serverCreateOffice(adminPb, ctx, {
      name: String(body.name ?? ""),
      lat: Number(body.lat),
      lng: Number(body.lng),
      radius: Number(body.radius),
      is_active: typeof body.is_active === "boolean" ? body.is_active : true,
      address: body.address != null ? String(body.address) : "",
      max_checkin_distance:
        body.max_checkin_distance != null ? Number(body.max_checkin_distance) : 0,
      timezone: body.timezone != null ? String(body.timezone) : "Asia/Jakarta",
      code: body.code != null ? String(body.code) : undefined,
    });
    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}
