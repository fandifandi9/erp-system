import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { getEntityIdentityForUser } from "@/lib/hr/entity-identity-server";
import { fetchEntityLogoBytes } from "@/lib/hr/entity-logo-server";

/** GET /api/profile/self/entity-logo — primary entity logo for authenticated staff (scoped). */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const adminPb = await getInventoryAdminPb();
    const identity = await getEntityIdentityForUser(adminPb, ctx.userId);
    if (!identity?.entity_id || !identity.logo) {
      return NextResponse.json({ ok: false, error: "Logo tidak tersedia." }, { status: 404 });
    }
    const file = await fetchEntityLogoBytes(adminPb, identity.entity_id, identity.logo);
    if (!file) {
      return NextResponse.json({ ok: false, error: "Logo tidak ditemukan." }, { status: 404 });
    }
    return new NextResponse(file.bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return hrJsonError(err);
  }
}
