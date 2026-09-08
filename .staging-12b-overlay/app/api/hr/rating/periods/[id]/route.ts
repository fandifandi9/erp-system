import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireOwnerOrHrApiUser,
} from "@/lib/hr/api-auth";
import { serverUpdatePeriodStatus } from "@/lib/hr/rating-server";
import type { RatingPeriodStatus } from "@/lib/hr/rating-types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = await requireOwnerOrHrApiUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const status = String(body.status || "") as RatingPeriodStatus;
    const adminPb = await getInventoryAdminPb();
    const row = await serverUpdatePeriodStatus(adminPb, auth, id, status);
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    return hrJsonError(err);
  }
}
