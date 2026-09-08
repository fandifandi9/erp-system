import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, rejectClientPrivilegeFields, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { listManageablePolicies, upsertHrPolicy } from "@/lib/hr/hr-policy-server";

/** GET /api/hr/policies — HR/Owner list policies. */
export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const adminPb = await getInventoryAdminPb();
    const items = await listManageablePolicies(adminPb, ctx);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/hr/policies — create/publish policy. */
export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    const data = await upsertHrPolicy(adminPb, ctx, {
      title: String(body.title ?? ""),
      category: String(body.category ?? "kehadiran"),
      content: String(body.content ?? ""),
      company_id: body.company_id != null ? String(body.company_id) : undefined,
      effective_from: body.effective_from != null ? String(body.effective_from) : undefined,
      publish: body.publish === true,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
