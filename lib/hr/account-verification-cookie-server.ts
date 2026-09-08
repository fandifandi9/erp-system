import type { NextResponse } from "next/server";
import {
  ACCOUNT_VERIFIED_COOKIE,
  ACCOUNT_VERIFICATION_MAX_AGE_SEC,
} from "@/lib/hr/account-verification";

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function applyAccountVerificationCookie(res: NextResponse, token: string) {
  res.cookies.set(ACCOUNT_VERIFIED_COOKIE, token, {
    ...cookieBase,
    maxAge: ACCOUNT_VERIFICATION_MAX_AGE_SEC,
  });
}

/** Revoke verification on logout or auth session invalidation. */
export function clearAccountVerificationCookie(res: NextResponse) {
  res.cookies.set(ACCOUNT_VERIFIED_COOKIE, "", { ...cookieBase, maxAge: 0 });
  // Legacy cookie from prior payslip-unlock implementation
  res.cookies.set("payslip_unlock", "", { ...cookieBase, maxAge: 0 });
}
