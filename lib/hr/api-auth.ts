import { cookies } from "next/headers";
import PocketBase from "pocketbase";
import {
  isHrAccount,
  isOwnerAccount,
  isOwnerOrHrAccount,
  normalizeAuthModel,
  type AuthModel,
} from "@/lib/auth-model";
import { parsePbAuthCookieValue } from "@/lib/pb-auth-cookie";
import { getInventoryAdminPb, getPocketBaseUrl } from "@/lib/inventory/pb-server";
import {
  assertCompanyInScope,
  getAccessibleCompanyIds,
  HrCompanyScopeError,
} from "@/lib/hr/company-scope";

export type HrApiAuthContext = {
  userId: string;
  /** Record from PocketBase authRefresh — never from request body. */
  user: Record<string, unknown>;
  auth: AuthModel;
  isOwner: boolean;
  isHr: boolean;
  /** Resolved server-side; never from client body. */
  companyIds: string[];
};

export class HrApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "HrApiError";
    this.status = status;
  }
}

/**
 * Validate session via PocketBase authRefresh only.
 * FAIL CLOSED: cookie model without successful refresh is rejected.
 * Does not trust userId / role / account_type / company_id from request body.
 */
export async function getAuthenticatedHrUser(req?: Request): Promise<HrApiAuthContext | null> {
  const token = await readAuthToken(req);
  if (!token) return null;

  const url = getPocketBaseUrl();
  if (!url) return null;

  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  pb.authStore.save(token, null as never);

  try {
    const refreshed = await pb.collection("users").authRefresh();
    const record = refreshed.record as Record<string, unknown>;
    if (!record?.id) return null;

    const userId = String(record.id);
    const auth = normalizeAuthModel(record);
    const isOwner = isOwnerAccount(record);
    const isHr = isHrAccount(record);

    let companyIds: string[] = [];
    try {
      const adminPb = await getInventoryAdminPb();
      companyIds = await getAccessibleCompanyIds(adminPb, userId, record);
    } catch {
      // Fail closed for scope: empty list; callers that need companies must deny.
      companyIds = [];
    }

    return {
      userId,
      user: record,
      auth,
      isOwner,
      isHr,
      companyIds,
    };
  } catch {
    return null;
  }
}

export async function requireAuthenticatedHrUser(req?: Request): Promise<HrApiAuthContext> {
  const ctx = await getAuthenticatedHrUser(req);
  if (!ctx) throw new HrApiError("Login diperlukan.", 401);
  return ctx;
}

/** Owner or HR (canonical). For future HR mutations / admin HR surfaces. */
export async function requireOwnerOrHrApiUser(req?: Request): Promise<HrApiAuthContext> {
  const ctx = await requireAuthenticatedHrUser(req);
  if (!isOwnerOrHrAccount(ctx.user)) {
    throw new HrApiError("Akses HR ditolak.", 403);
  }
  return ctx;
}

export async function requireOwnerApiUser(req?: Request): Promise<HrApiAuthContext> {
  const ctx = await requireAuthenticatedHrUser(req);
  if (!ctx.isOwner) {
    throw new HrApiError("Hanya Owner.", 403);
  }
  return ctx;
}

/**
 * Verify a company id against server-resolved scope.
 * Never use companyId from the client as authorization by itself.
 */
export function requireCompanyInActorScope(
  ctx: HrApiAuthContext,
  companyId: string | null | undefined,
): void {
  try {
    assertCompanyInScope(companyId, ctx.companyIds);
  } catch (e) {
    if (e instanceof HrCompanyScopeError) {
      throw new HrApiError(e.message, 403);
    }
    throw e;
  }
}

/**
 * Reject forged identity / privilege fields from client payloads.
 * Future mutation handlers should call this on every write body.
 */
export function rejectClientPrivilegeFields(body: Record<string, unknown> | null | undefined): void {
  if (!body || typeof body !== "object") return;
  const forbidden = [
    "account_type",
    "role",
    "role_code",
    "hr_action_by",
    "hr_action_name",
    "hr_action_at",
    "approved_by",
    "approved_at",
    "rejected_by",
    "rejected_at",
  ] as const;

  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new HrApiError(`Field '${key}' tidak boleh dikirim oleh klien.`, 400);
    }
  }
}

export function hrJsonError(err: unknown, fallback = "Terjadi kesalahan.") {
  if (err instanceof HrApiError) {
    return Response.json({ ok: false, error: err.message }, { status: err.status });
  }
  if (err instanceof HrCompanyScopeError) {
    return Response.json({ ok: false, error: err.message }, { status: 403 });
  }
  const msg = err instanceof Error ? err.message : fallback;
  return Response.json({ ok: false, error: msg }, { status: 500 });
}

async function readAuthToken(req?: Request): Promise<string | null> {
  const bearer = req?.headers.get("authorization")?.trim();
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7).trim();
    if (token) return token;
  }

  const jar = await cookies();
  const raw = jar.get("pb_auth")?.value;
  if (!raw) return null;
  return parsePbAuthCookieValue(raw)?.token?.trim() || null;
}
