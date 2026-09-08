import { cookies } from "next/headers";
import PocketBase from "pocketbase";
import {
  isHrAccount,
  isOwnerAccount,
  normalizeAuthModel,
  type AuthModel,
} from "@/lib/auth-model";
import { parsePbAuthCookieValue } from "@/lib/pb-auth-cookie";
import { getInventoryAdminPb, getPocketBaseUrl } from "@/lib/inventory/pb-server";
import {
  PbServiceUnavailableError,
  toClientSafeServiceError,
} from "@/lib/inventory/pb-service-error";
import {
  assertCompanyInScope,
  getAccessibleCompanyIds,
  HrCompanyScopeError,
} from "@/lib/hr/company-scope";
import { ModuleAccessError } from "@/lib/access/assert";
import {
  assertHrModuleEntityAccess,
  ensureHrAccessContext,
  requireHrModuleApiUser,
} from "@/lib/access/hr-api-enforcement";
import type { UserAccessContext } from "@/lib/access/types";
import { loadUserAccessContext } from "@/lib/access/module-assignments-server";

export type HrApiAuthContext = {
  userId: string;
  /** Record from PocketBase authRefresh — never from request body. */
  user: Record<string, unknown>;
  auth: AuthModel;
  isOwner: boolean;
  isHr: boolean;
  /** Resolved server-side; never from client body. */
  companyIds: string[];
  /** Lazy-loaded module access context (Phase 35I-A). */
  accessContext?: UserAccessContext | null;
};

export class HrApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "HrApiError";
    this.status = status;
    this.code = code;
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
    let accessContext: UserAccessContext | null = null;
    try {
      const adminPb = await getInventoryAdminPb();
      companyIds = await getAccessibleCompanyIds(adminPb, userId, record);
      try {
        accessContext = await loadUserAccessContext(adminPb, record);
      } catch {
        accessContext = null;
      }
    } catch {
      // Fail closed for scope: empty list; callers that need companies must deny.
      companyIds = [];
      accessContext = null;
    }

    return {
      userId,
      user: record,
      auth,
      isOwner,
      isHr,
      companyIds,
      accessContext,
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

/** Owner or HR (canonical) or Staff+HR module assignment. */
export async function requireOwnerOrHrApiUser(req?: Request): Promise<HrApiAuthContext> {
  const ctx = await requireAuthenticatedHrUser(req);
  const adminPb = await getInventoryAdminPb();
  return requireHrModuleApiUser(adminPb, ctx);
}

/** Ensure module access context is loaded for capability/entity enforcement. */
export async function withHrAccessContext(
  adminPb: Awaited<ReturnType<typeof getInventoryAdminPb>>,
  ctx: HrApiAuthContext,
): Promise<HrApiAuthContext> {
  return ensureHrAccessContext(adminPb, ctx);
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
 * Membership scope + HR module entity scope when assignment exists.
 * Use for HR mutations/reads that carry company_id.
 */
export function requireCompanyInHrModuleScope(
  ctx: HrApiAuthContext,
  companyId: string | null | undefined,
): void {
  try {
    assertHrModuleEntityAccess(ctx, companyId);
  } catch (e) {
    if (e instanceof ModuleAccessError) {
      throw new HrApiError(e.message, 403);
    }
    throw e;
  }
}

const CLIENT_IDENTITY_FORGERY_FIELD_NAMES = [
  "account_type",
  "role",
  "role_code",
  "status",
  "inventory_role",
  "hr_role_preset",
  "web_access",
  "active_company",
  "default_company",
  "active_store",
  "default_store",
  "active_warehouse",
  "default_warehouse",
  "is_checked_in",
  "shift_active",
  "last_checkin",
  "last_checkout",
  "locale",
  "session_nonce",
  "mobile_session_nonce",
  "hr_action_by",
  "hr_action_name",
  "hr_action_at",
  "approved_by",
  "approved_at",
  "rejected_by",
  "rejected_at",
] as const;

/**
 * Reject forged identity / privilege fields from client payloads.
 * Future mutation handlers should call this on every write body.
 */
export function rejectClientPrivilegeFields(body: Record<string, unknown> | null | undefined): void {
  if (!body || typeof body !== "object") return;
  const forbidden = [
    ...CLIENT_IDENTITY_FORGERY_FIELD_NAMES,
    "dashboard_access",
    "oldPassword",
    "password",
    "passwordConfirm",
  ] as const;

  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new HrApiError(`Field '${key}' tidak boleh dikirim oleh klien.`, 400);
    }
  }
}

/**
 * Reject identity forgery on authorized HR employee create/update bodies.
 * Allows `dashboard_access` and `role_preset_id` — applied server-side after capability checks.
 */
export function rejectClientEmployeeMutationForgeryFields(
  body: Record<string, unknown> | null | undefined,
  options?: { allowPassword?: boolean },
): void {
  if (!body || typeof body !== "object") return;

  const forbidden: string[] = [...CLIENT_IDENTITY_FORGERY_FIELD_NAMES];
  if (!options?.allowPassword) {
    forbidden.push("oldPassword", "password", "passwordConfirm");
  }

  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new HrApiError(`Field '${key}' tidak boleh dikirim oleh klien.`, 400);
    }
  }
}

export function hrJsonError(err: unknown, fallback = "Terjadi kesalahan.") {
  if (err instanceof HrApiError) {
    return Response.json(
      { ok: false, error: err.message, ...(err.code ? { code: err.code } : {}) },
      { status: err.status },
    );
  }
  if (err instanceof HrCompanyScopeError) {
    return Response.json({ ok: false, error: err.message }, { status: 403 });
  }
  if (err instanceof ModuleAccessError) {
    return Response.json({ ok: false, error: err.message }, { status: 403 });
  }
  if (err instanceof PbServiceUnavailableError) {
    return Response.json({ ok: false, error: err.message }, { status: err.status });
  }
  const safe = toClientSafeServiceError(err);
  if (safe) {
    return Response.json({ ok: false, error: safe.message }, { status: safe.status });
  }
  const msg = err instanceof Error ? err.message : fallback;
  const status =
    err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  const pbUrl =
    err && typeof err === "object" && "url" in err ? String((err as { url?: string }).url || "") : "";
  const looksMissingRatingCollection =
    /hr_rating/i.test(pbUrl) &&
    (/requested resource wasn't found/i.test(msg) || status === 404);
  if (looksMissingRatingCollection) {
    return Response.json(
      {
        ok: false,
        error:
          "Koleksi Rating tidak ada di PocketBase yang dipakai aplikasi ini. Schema Rating hanya di STAGING (127.0.0.1:8092 / pb-staging.serba.space), belum di production. Jangan uji Rating lewat npm run dev yang mengarah ke pb.serba.space. Gunakan https://staging.serba.space atau npm run staging:next-dev.",
      },
      { status: 503 },
    );
  }
  const looksMissingReportingCollection =
    /hr_staff_reports|hr_findings|hr_case_attachments/i.test(pbUrl) &&
    (/requested resource wasn't found/i.test(msg) || status === 404);
  if (looksMissingReportingCollection) {
    return Response.json(
      {
        ok: false,
        error:
          "Koleksi Laporan/Temuan tidak ada di PocketBase ini. Schema hanya di STAGING. Jalankan npm run pb:hr-reporting-schema:staging dan gunakan staging.serba.space.",
      },
      { status: 503 },
    );
  }
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

/** Auth token from HttpOnly cookie or Authorization header (for session-bound payslip unlock). */
export async function readRequestAuthToken(req?: Request): Promise<string | null> {
  return readAuthToken(req);
}
