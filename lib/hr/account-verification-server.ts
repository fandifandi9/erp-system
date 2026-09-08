/**
 * Phase 34F — Account verification (password, session-bound, 15 min fixed).
 */

import { cookies } from "next/headers";
import type PocketBase from "pocketbase";
import { HrApiError, readRequestAuthToken, type HrApiAuthContext } from "@/lib/hr/api-auth";
import {
  ACCOUNT_VERIFIED_COOKIE,
  assertVerificationNotLocked,
  createAccountVerificationToken,
  hashAuthSessionKey,
  nextLockUntilAfterFailure,
  readAccountVerificationTokenFromRequest,
  verifyAccountVerificationToken,
} from "@/lib/hr/account-verification";
import { emitPayslipAuditEvent } from "@/lib/hr/payroll-audit";
import {
  collectPasswordVerificationIdentities,
  pocketBaseAuthWithPassword,
  refreshUserAuthFields,
} from "@/lib/hr/account-verification-identities";

/** Reuse existing profile fields (no migration) for verification rate limit. */
const VERIFY_FAILED_FIELD = "payslip_pin_failed_attempts";
const VERIFY_LOCKED_FIELD = "payslip_pin_locked_until";

export type AccountVerificationStatus = {
  verified: boolean;
  locked: boolean;
  locked_until?: string;
};

async function resolveSessionKey(req: Request): Promise<string> {
  const authToken = await readRequestAuthToken(req);
  if (!authToken) throw new HrApiError("Login diperlukan.", 401);
  return hashAuthSessionKey(authToken);
}

async function getVerifyRateLimitFields(
  adminPb: PocketBase,
  userId: string,
): Promise<{ profileId: string; failed: number; lockedUntil: string }> {
  const rows = await adminPb.collection("profiles").getFullList({
    filter: `user = "${userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
    fields: `id,${VERIFY_FAILED_FIELD},${VERIFY_LOCKED_FIELD}`,
    requestKey: null,
  });
  if (!rows[0]) throw new HrApiError("Profil tidak ditemukan.", 404);
  const p = rows[0] as Record<string, unknown>;
  return {
    profileId: String(p.id),
    failed: Number(p[VERIFY_FAILED_FIELD] ?? 0),
    lockedUntil: String(p[VERIFY_LOCKED_FIELD] ?? ""),
  };
}

export async function isAccountVerifiedForRequest(
  req: Request,
  userId: string,
): Promise<boolean> {
  const jar = await cookies();
  const cookieToken = jar.get(ACCOUNT_VERIFIED_COOKIE)?.value;
  const headerToken = readAccountVerificationTokenFromRequest(req);
  const token = headerToken || cookieToken;
  if (!token) return false;
  try {
    const sessionKey = await resolveSessionKey(req);
    return await verifyAccountVerificationToken(token, userId, sessionKey);
  } catch {
    return false;
  }
}

export async function getAccountVerificationStatus(
  adminPb: PocketBase,
  userId: string,
  req: Request,
): Promise<AccountVerificationStatus> {
  const { lockedUntil } = await getVerifyRateLimitFields(adminPb, userId);
  const locked = Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now());
  const verified = await isAccountVerifiedForRequest(req, userId);
  return {
    verified,
    locked,
    locked_until: locked ? lockedUntil : undefined,
  };
}

/** Gate sensitive self-service data (payslip, private documents). HR scoped access skips. */
export async function assertAccountVerified(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  req: Request,
  targetUserId: string,
): Promise<void> {
  if (targetUserId !== ctx.userId) return;

  const sessionKey = await resolveSessionKey(req);
  const jar = await cookies();
  const cookieToken = jar.get(ACCOUNT_VERIFIED_COOKIE)?.value;
  const headerToken = readAccountVerificationTokenFromRequest(req);
  const token = headerToken || cookieToken;

  if (token && (await verifyAccountVerificationToken(token, ctx.userId, sessionKey))) {
    return;
  }

  throw new HrApiError("Verifikasi akun diperlukan.", 403, "ACCOUNT_VERIFICATION_REQUIRED");
}

export async function verifyAccountWithPassword(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  password: string,
  sessionKey: string,
): Promise<{ token: string }> {
  if (!password) {
    throw new HrApiError("Kata sandi akun diperlukan.", 400);
  }

  const userRecord = await refreshUserAuthFields(adminPb, ctx.userId, ctx.user);
  const identities = collectPasswordVerificationIdentities(userRecord);
  if (!identities.length) {
    throw new HrApiError("Identitas akun tidak ditemukan. Hubungi HR.", 400);
  }

  const { profileId, lockedUntil } = await getVerifyRateLimitFields(adminPb, ctx.userId);
  assertVerificationNotLocked(lockedUntil);

  const url = adminPb.baseURL;
  let authed = false;
  for (const identity of identities) {
    if (await pocketBaseAuthWithPassword(url, identity, password)) {
      authed = true;
      break;
    }
  }

  if (!authed) {
    const attempts = (await getVerifyRateLimitFields(adminPb, ctx.userId)).failed + 1;
    const lockUntil = nextLockUntilAfterFailure(attempts);
    await adminPb.collection("profiles").update(
      profileId,
      {
        [VERIFY_FAILED_FIELD]: attempts,
        [VERIFY_LOCKED_FIELD]: lockUntil || "",
      },
      { requestKey: null },
    );
    await emitPayslipAuditEvent(adminPb, {
      event_code: "account.verification_failed",
      actor_id: ctx.userId,
      payroll_item_id: "verify",
      target_user_id: ctx.userId,
    });
    throw new HrApiError(
      lockUntil
        ? "Terlalu banyak percobaan. Verifikasi terkunci sementara."
        : "Kata sandi salah. Gunakan kata sandi yang sama saat login (bukan PIN).",
      lockUntil ? 429 : 403,
    );
  }

  await adminPb.collection("profiles").update(
    profileId,
    { [VERIFY_FAILED_FIELD]: 0, [VERIFY_LOCKED_FIELD]: "" },
    { requestKey: null },
  );

  const token = await createAccountVerificationToken(ctx.userId, sessionKey);
  await emitPayslipAuditEvent(adminPb, {
    event_code: "account.verification_success",
    actor_id: ctx.userId,
    payroll_item_id: "verify",
    target_user_id: ctx.userId,
  });
  return { token };
}
