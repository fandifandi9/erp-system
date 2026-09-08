import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireOwnerOrHrApiUser,
} from "@/lib/hr/api-auth";
import { serverCreatePeriod, serverListPeriods } from "@/lib/hr/rating-server";
import type { RatingPeriodStatus } from "@/lib/hr/rating-types";

export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const adminPb = await getInventoryAdminPb();
    const items = await serverListPeriods(adminPb, ctx);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    const row = await serverCreatePeriod(adminPb, ctx, {
      name: String(body.name || ""),
      start_date: String(body.start_date || ""),
      end_date: String(body.end_date || ""),
      description: body.description != null ? String(body.description) : undefined,
      status: (body.status as RatingPeriodStatus) || "draft",
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    return hrJsonError(err);
  }
}
