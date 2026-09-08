import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireAuthenticatedHrUser,
} from "@/lib/hr/api-auth";
import {
  serverGetScheduleDays,
  serverUpdateScheduleDays,
} from "@/lib/hr/work-schedule-server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/hr/work-schedules/[id]/days */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await requireAuthenticatedHrUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const days = await serverGetScheduleDays(adminPb, auth, id);
    return NextResponse.json({ ok: true, data: days });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** PATCH /api/hr/work-schedules/[id]/days */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = await requireAuthenticatedHrUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { days?: unknown[] };
    rejectClientPrivilegeFields(body as Record<string, unknown>);
    if (!Array.isArray(body.days)) {
      return NextResponse.json({ ok: false, error: "days wajib berupa array." }, { status: 400 });
    }
    const adminPb = await getInventoryAdminPb();
    await serverUpdateScheduleDays(adminPb, auth, id, body.days as never[]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hrJsonError(err);
  }
}
