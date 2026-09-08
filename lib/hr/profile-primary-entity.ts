/**
 * Phase 34D — Resolve primary administrative entity for profile display.
 * Canonical: biz_user_companies.is_primary → biz_company_profile.
 * Does NOT use users.default_company / active_company / profiles.company.
 */

import type PocketBase from "pocketbase";
import { USER_COMPANIES_COLLECTION } from "@/lib/tenant/company-access";

export type PrimaryEntityStatus = "resolved" | "undetermined" | "ambiguous" | "none";

export type PrimaryEntityDisplay = {
  status: PrimaryEntityStatus;
  /** Human-readable label for UI */
  label: string;
  company_id?: string;
  company_name?: string;
  entity_type?: string;
  code?: string;
  membership_count: number;
};

type MembershipRow = {
  company: string;
  is_primary?: boolean;
  expand?: {
    company?: {
      id: string;
      company_name?: string;
      code?: string;
      entity_type?: string;
      is_active?: boolean;
    };
  };
};

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function companyFromRow(row: MembershipRow) {
  return row.expand?.company;
}

function toResolved(row: MembershipRow, membershipCount: number): PrimaryEntityDisplay {
  const c = companyFromRow(row);
  const name = c?.company_name?.trim() || "—";
  return {
    status: "resolved",
    label: name,
    company_id: c?.id || row.company,
    company_name: name,
    entity_type: c?.entity_type?.trim() || undefined,
    code: c?.code?.trim() || undefined,
    membership_count: membershipCount,
  };
}

/**
 * Resolve primary administrative entity for display on /profile.
 * Fail closed — never guess from default_company / active_company.
 */
export function resolvePrimaryAdministrativeEntity(
  memberships: MembershipRow[],
): PrimaryEntityDisplay {
  const active = memberships.filter((r) => {
    const c = companyFromRow(r);
    return c ? c.is_active !== false : true;
  });

  if (active.length === 0) {
    return {
      status: "none",
      label: "Belum ditentukan",
      membership_count: 0,
    };
  }

  if (active.length === 1) {
    return toResolved(active[0]!, 1);
  }

  const primaries = active.filter((r) => r.is_primary === true);
  if (primaries.length === 1) {
    return toResolved(primaries[0]!, active.length);
  }
  if (primaries.length === 0) {
    return {
      status: "undetermined",
      label: "Belum ditentukan",
      membership_count: active.length,
    };
  }
  return {
    status: "ambiguous",
    label: "Data entitas tidak valid — hubungi HR",
    membership_count: active.length,
  };
}

export function membershipSummary(display: PrimaryEntityDisplay): string | null {
  if (display.membership_count <= 1) {
    return display.status === "resolved" ? "1 entitas utama" : null;
  }
  if (display.status === "resolved") return "Beberapa entitas";
  return `${display.membership_count} entitas`;
}

export async function fetchPrimaryAdministrativeEntityForUser(
  adminPb: PocketBase,
  userId: string,
): Promise<PrimaryEntityDisplay> {
  try {
    const rows = (await adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<MembershipRow>({
      filter: `user = "${pbEscape(userId)}" && is_active != false`,
      expand: "company",
      sort: "-is_primary,created",
      requestKey: null,
    })) as MembershipRow[];
    return resolvePrimaryAdministrativeEntity(rows);
  } catch {
    return {
      status: "none",
      label: "Belum ditentukan",
      membership_count: 0,
    };
  }
}
