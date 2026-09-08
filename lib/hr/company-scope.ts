import type PocketBase from "pocketbase";
import { isOwnerAccount } from "@/lib/auth-model";
import { USER_COMPANIES_COLLECTION } from "@/lib/tenant/company-access";

/**
 * Wave 1 company-scope foundation for future HR mutations.
 *
 * FAIL CLOSED:
 * - Owner → all active `biz_company_profile` ids.
 * - Non-owner → only active rows in `biz_user_companies` (no active_company fallback).
 * - Empty / undetermined → `[]` (callers must deny).
 *
 * Does NOT stamp `profiles.company` (Wave 2+). Does not change existing work-context APIs.
 */
export async function getAccessibleCompanyIds(
  adminPb: PocketBase,
  userId: string,
  userRecord?: Record<string, unknown> | null,
): Promise<string[]> {
  if (!userId.trim()) return [];

  let user = userRecord ?? null;
  if (!user) {
    try {
      user = (await adminPb.collection("users").getOne(userId)) as Record<string, unknown>;
    } catch {
      return [];
    }
  }

  if (isOwnerAccount(user)) {
    try {
      const all = await adminPb.collection("biz_company_profile").getFullList<{ id: string }>({
        filter: "is_active = true",
        sort: "company_name",
        requestKey: null,
      });
      return all.map((c) => c.id).filter(Boolean);
    } catch {
      return [];
    }
  }

  try {
    const rows = await adminPb
      .collection(USER_COMPANIES_COLLECTION)
      .getFullList<{ company: string }>({
        filter: `user = "${userId}" && is_active != false`,
        fields: "company",
        requestKey: null,
      });
    return [...new Set(rows.map((r) => r.company).filter(Boolean))];
  } catch {
    return [];
  }
}

/**
 * FLEX-ORG-04 — Keep only active legal entities (biz_company_profile.is_active).
 * Fail-closed: missing / inactive / unknown ids are dropped.
 */
export async function filterActiveCompanyIds(
  adminPb: PocketBase,
  companyIds: readonly string[],
): Promise<string[]> {
  const ids = [...new Set(companyIds.map((x) => String(x || "").trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  try {
    const or = ids.map((id) => `id = "${id.replace(/"/g, '\\"')}"`).join(" || ");
    const rows = await adminPb.collection("biz_company_profile").getFullList<{
      id: string;
      is_active?: boolean;
    }>({
      filter: `(${or}) && is_active = true`,
      fields: "id,is_active",
      requestKey: null,
    });
    const active = new Set(rows.map((r) => r.id).filter(Boolean));
    return ids.filter((id) => active.has(id));
  } catch {
    return [];
  }
}

/** Fail closed: missing / empty companyId or not in allowed set → false. */
export function isCompanyInScope(
  companyId: string | null | undefined,
  accessibleCompanyIds: string[],
): boolean {
  const id = (companyId ?? "").trim();
  if (!id) return false;
  if (!Array.isArray(accessibleCompanyIds) || accessibleCompanyIds.length === 0) return false;
  return accessibleCompanyIds.includes(id);
}

export function assertCompanyInScope(
  companyId: string | null | undefined,
  accessibleCompanyIds: string[],
): void {
  if (!isCompanyInScope(companyId, accessibleCompanyIds)) {
    throw new HrCompanyScopeError("Akses entitas ditolak atau tidak dapat ditentukan.");
  }
}

export class HrCompanyScopeError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "HrCompanyScopeError";
  }
}
