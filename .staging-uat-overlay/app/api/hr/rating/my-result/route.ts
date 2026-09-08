import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  HrApiError,
} from "@/lib/hr/api-auth";
import { serverGetMyResult } from "@/lib/hr/rating-server";

export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const assignmentId = new URL(req.url).searchParams.get("assignment") || undefined;
    const adminPb = await getInventoryAdminPb();
    const data = await serverGetMyResult(adminPb, ctx, assignmentId);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
