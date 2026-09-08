import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { getEntityIdentityForUser } from "@/lib/hr/entity-identity-server";

/** GET /api/profile/self/entity-identity — primary entity branding for staff modules. */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const adminPb = await getInventoryAdminPb();
    const data = await getEntityIdentityForUser(adminPb, ctx.userId);
    if (data?.logo) {
      const v = data.updated_at ? `?v=${encodeURIComponent(data.updated_at)}` : "";
      return NextResponse.json({
        ok: true,
        data: { ...data, logo_url: `/api/profile/self/entity-logo${v}` },
      });
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
