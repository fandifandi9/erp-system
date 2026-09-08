/**
 * Phase 34F — Session-bound account verification grant (15 min, fixed expiry).
 * Used for payslip, personal documents, and other self sensitive data.
 * Client also revokes on 15m idle or 15m away from sensitive modules.
 */

import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { HrApiError } from "@/lib/hr/api-auth";

const ISSUER = "serba-erp";
const AUDIENCE = "account-verification";
export const ACCOUNT_VERIFICATION_TTL = "15m";
export const ACCOUNT_VERIFICATION_MAX_AGE_SEC = 15 * 60;
export const MAX_VERIFY_ATTEMPTS = 5;
export const VERIFY_LOCK_MINUTES = 15;

/** HttpOnly cookie storing verification JWT. */
export const ACCOUNT_VERIFIED_COOKIE = "account_verified";

function getVerificationSecret(): Uint8Array {
  const raw =
    process.env.ACCOUNT_VERIFICATION_SECRET?.trim() ||
    process.env.PAYSLIP_UNLOCK_SECRET?.trim() ||
    process.env.PASSWORD_RESET_SECRET?.trim() ||
    "local-dev-account-verification-secret-min-16";
  return new TextEncoder().encode(raw);
}

/** Bind verification grant to current PocketBase auth token (new login → invalid grant). */
export function hashAuthSessionKey(authToken: string): string {
  return createHash("sha256").update(authToken).digest("hex").slice(0, 32);
}

export async function createAccountVerificationToken(
  userId: string,
  sessionKey: string,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({
    purpose: "account_verification",
    sk: sessionKey,
    iat: issuedAt,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(ACCOUNT_VERIFICATION_TTL)
    .sign(getVerificationSecret());
}

export async function verifyAccountVerificationToken(
  token: string,
  expectedUserId: string,
  expectedSessionKey: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getVerificationSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (payload.sub !== expectedUserId) return false;
    if (payload.purpose !== "account_verification") return false;
    if (typeof payload.sk !== "string" || !payload.sk) return false;
    return payload.sk === expectedSessionKey;
  } catch {
    return false;
  }
}

export function readAccountVerificationTokenFromRequest(req: Request): string | null {
  const bearer = req.headers.get("authorization")?.trim();
  if (bearer?.toLowerCase().startsWith("bearer account-verify ")) {
    return bearer.slice(20).trim() || null;
  }
  const header = req.headers.get("x-account-verified")?.trim();
  return header || null;
}

export function assertVerificationNotLocked(lockedUntil: string | null | undefined): void {
  if (!lockedUntil) return;
  const until = new Date(lockedUntil);
  if (Number.isNaN(until.getTime())) return;
  if (until.getTime() > Date.now()) {
    throw new HrApiError("Verifikasi akun terkunci sementara. Coba lagi nanti.", 429);
  }
}

export function nextLockUntilAfterFailure(failedAttempts: number): string | null {
  if (failedAttempts >= MAX_VERIFY_ATTEMPTS) {
    return new Date(Date.now() + VERIFY_LOCK_MINUTES * 60 * 1000).toISOString();
  }
  return null;
}
