import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  readRequestAuthToken,
  rejectClientEmployeeMutationForgeryFields,
  requireAuthenticatedHrUser,
} from "@/lib/hr/api-auth";
import { hashAuthSessionKey } from "@/lib/hr/account-verification";
import { verifyAccountWithPassword } from "@/lib/hr/account-verification-server";
import {
  applyAccountVerificationCookie,
  clearAccountVerificationCookie,
} from "@/lib/hr/account-verification-cookie-server";

/** POST /api/account/verify — verify account ownership with login password. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientEmployeeMutationForgeryFields(body, { allowPassword: true });

    const password = String(body.password ?? "");
    if (!password) {
      return NextResponse.json({ ok: false, error: "Kata sandi akun diperlukan." }, { status: 400 });
    }

    const authToken = await readRequestAuthToken(req);
    if (!authToken) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }

    const adminPb = await getInventoryAdminPb();
    const { token } = await verifyAccountWithPassword(
      adminPb,
      ctx,
      password,
      hashAuthSessionKey(authToken),
    );

    // token returned for native/mobile clients (web primarily uses HttpOnly cookie)
    const res = NextResponse.json({ ok: true, token });
    applyAccountVerificationCookie(res, token);
    return res;
  } catch (err) {
    return hrJsonError(err);
  }
}

/** DELETE /api/account/verify — revoke grant (idle / leave module). */
export async function DELETE(req: Request) {
  try {
    await requireAuthenticatedHrUser(req);
    const res = NextResponse.json({ ok: true });
    clearAccountVerificationCookie(res);
    return res;
  } catch (err) {
    return hrJsonError(err);
  }
}
