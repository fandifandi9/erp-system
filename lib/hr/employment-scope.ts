/**
 * Phase 34B/34C — Resolve legal-entity (company) for attendance from server-side membership.
 * Never trust client-supplied company_id.
 */
import type PocketBase from "pocketbase";
import { isOwnerAccount } from "@/lib/auth-model";
import { USER_COMPANIES_COLLECTION } from "@/lib/tenant/company-access";
import { HrApiError } from "@/lib/hr/api-auth";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export type ActiveMembership = {
  companyId: string;
  isActive: boolean;
  isPrimary: boolean;
};

/** List active company memberships for a user. */
export async function listActiveCompanyMemberships(
  adminPb: PocketBase,
  userId: string,
): Promise<ActiveMembership[]> {
  if (!userId.trim()) return [];
  try {
    const rows = await adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<{
      company: string;
      is_active?: boolean;
      is_primary?: boolean;
    }>({
      filter: `user = "${pbEscape(userId)}" && is_active != false`,
      fields: "company,is_active,is_primary",
      sort: "created",
      requestKey: null,
    });
    return rows
      .map((r) => ({
        companyId: String(r.company || ""),
        isActive: r.is_active !== false,
        isPrimary: r.is_primary === true,
      }))
      .filter((r) => r.companyId);
  } catch {
    return [];
  }
}

/**
 * Deterministic primary company for attendance stamping (Phase 34C).
 * - 0 memberships: error (except owner fallback to first active entity)
 * - 1 membership: use it
 * - multiple: row with is_primary=true; else error (no guess)
 */
export async function resolveAttendanceCompanyId(
  adminPb: PocketBase,
  userId: string,
  userRecord?: Record<string, unknown> | null,
): Promise<string> {
  let user = userRecord ?? null;
  if (!user) {
    try {
      user = (await adminPb.collection("users").getOne(userId, {
        fields: "id,account_type,role",
        requestKey: null,
      })) as Record<string, unknown>;
    } catch {
      throw new HrApiError("User tidak ditemukan.", 403);
    }
  }

  const memberships = await listActiveCompanyMemberships(adminPb, userId);
  const memberIds = memberships.map((m) => m.companyId);

  if (memberIds.length === 0) {
    if (isOwnerAccount(user)) {
      const all = await adminPb.collection("biz_company_profile").getFullList<{ id: string }>({
        filter: "is_active = true",
        sort: "company_name",
        fields: "id",
        requestKey: null,
      });
      const first = all[0]?.id;
      if (first) return first;
    }
    throw new HrApiError(
      "Keanggotaan perusahaan belum ditetapkan. Hubungi HR untuk penugasan legal entity.",
      403,
    );
  }

  if (memberIds.length === 1) return memberIds[0]!;

  const primary = memberships.find((m) => m.isPrimary);
  if (primary) return primary.companyId;

  throw new HrApiError(
    "Beberapa keanggotaan perusahaan aktif. Hubungi HR untuk menetapkan entitas utama sebelum absensi.",
    403,
  );
}

/** User IDs with active membership in any of the given companies. */
export async function listUserIdsInCompanies(
  adminPb: PocketBase,
  companyIds: string[],
): Promise<string[]> {
  if (!companyIds.length) return [];
  const filter = companyIds.map((c) => `company = "${pbEscape(c)}"`).join(" || ");
  try {
    const rows = await adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<{ user: string }>({
      filter: `(${filter}) && is_active != false`,
      fields: "user",
      requestKey: null,
    });
    return [...new Set(rows.map((r) => String(r.user || "")).filter(Boolean))];
  } catch {
    return [];
  }
}
