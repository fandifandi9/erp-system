import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireOwnerOrHrApiUser,
} from "@/lib/hr/api-auth";
import {
  serverCreateAssignment,
  serverListAssignmentsForHr,
} from "@/lib/hr/rating-server";
import type { RatingAssignmentMethod } from "@/lib/hr/rating-types";

export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const periodId = new URL(req.url).searchParams.get("period") || undefined;
    const adminPb = await getInventoryAdminPb();
    const items = await serverListAssignmentsForHr(adminPb, ctx, periodId);
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
    for (const key of ["user", "userId", "subject"] as const) {
      // subject must be explicit subject_user_id only
      if (key !== "subject" && Object.prototype.hasOwnProperty.call(body, key)) {
        return NextResponse.json(
          { ok: false, error: `Field '${key}' tidak boleh dikirim.` },
          { status: 400 },
        );
      }
    }
    const adminPb = await getInventoryAdminPb();
    const result = await serverCreateAssignment(adminPb, ctx, {
      period_id: String(body.period_id || ""),
      subject_user_id: String(body.subject_user_id || body.subject || ""),
      reviewer_count: Number(body.reviewer_count),
      method: (String(body.method || "smart_random") as RatingAssignmentMethod),
      manual_reviewer_ids: Array.isArray(body.manual_reviewer_ids)
        ? body.manual_reviewer_ids.map(String)
        : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return hrJsonError(err);
  }
}
