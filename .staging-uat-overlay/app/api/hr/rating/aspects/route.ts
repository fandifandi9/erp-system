import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  HrApiError,
} from "@/lib/hr/api-auth";
import { serverListAspects } from "@/lib/hr/rating-server";

export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const adminPb = await getInventoryAdminPb();
    const items = await serverListAspects(adminPb);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}
