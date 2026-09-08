import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { serverUpdateSelfAvatar } from "@/lib/hr/profile-mutation-server";

/** POST /api/profile/self/avatar — multipart avatar upload/remove. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const formData = await req.formData();
    const adminPb = await getInventoryAdminPb();
    const profile = await serverUpdateSelfAvatar(adminPb, ctx.userId, formData);
    return NextResponse.json({ ok: true, data: profile });
  } catch (err) {
    return hrJsonError(err);
  }
}
