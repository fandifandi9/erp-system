import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { getEntityIdentityById } from "@/lib/hr/entity-identity-server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/master-data/legal-entities/[id]/identity — scoped entity identity SSOT. */
export async function GET(req: Request, context: Ctx) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const { id } = await context.params;
    const adminPb = await getInventoryAdminPb();
    const data = await getEntityIdentityById(adminPb, ctx, id);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
