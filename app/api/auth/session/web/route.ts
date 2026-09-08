import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { serverRegisterWebSessionNonce } from "@/lib/hr/user-self-mutation-server";

/** POST /api/auth/session/web — rotate web session nonce (server-authoritative). */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const adminPb = await getInventoryAdminPb();
    const nonce = await serverRegisterWebSessionNonce(adminPb, ctx.userId);
    return NextResponse.json({ ok: true, nonce });
  } catch (err) {
    return hrJsonError(err);
  }
}
