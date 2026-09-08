/**
 * Phase FLEX-ORG-01 — Multi-company visibility helpers (foundation).
 * Operating mode never grants cross-company data by itself.
 */

import {
  operatingModeImpliesCrossCompanyAccess,
  parseCompanyOperatingMode,
  type CompanyOperatingMode,
  type CompanyOperatingProfile,
} from "@/lib/org/company-operating-model";

export type CompanyProfileRow = {
  id: string;
  operating_mode?: string;
  management_group?: string;
  management_group_id?: string;
  is_active?: boolean;
};

export function mapCompanyOperatingProfile(row: CompanyProfileRow): CompanyOperatingProfile {
  return {
    companyId: String(row.id ?? "").trim(),
    operatingMode: parseCompanyOperatingMode(row.operating_mode),
    managementGroupId:
      String(row.management_group ?? row.management_group_id ?? "").trim() || null,
  };
}

/**
 * Given membership company ids + operating profiles, compute which company ids
 * are visible for listing. Does NOT expand group to all members automatically.
 */
export function resolveVisibleCompanyIdsFromMembership(input: {
  membershipCompanyIds: string[];
  profiles?: CompanyOperatingProfile[];
  /** Explicit extra scope (module entities / position scope) */
  explicitScopeCompanyIds?: string[];
}): string[] {
  const membership = new Set(input.membershipCompanyIds.filter(Boolean));
  const explicit = new Set((input.explicitScopeCompanyIds ?? []).filter(Boolean));

  // Always: membership ∪ explicit. Group mode never auto-adds siblings.
  const out = new Set<string>([...membership, ...explicit]);

  if (input.profiles) {
    for (const p of input.profiles) {
      // Document invariant for tests / callers
      void operatingModeImpliesCrossCompanyAccess(p.operatingMode);
    }
  }

  return [...out];
}

export function assertIndependentCompaniesDoNotLeak(input: {
  actorCompanyIds: string[];
  targetCompanyId: string;
}): boolean {
  const allowed = new Set(input.actorCompanyIds);
  return allowed.has(input.targetCompanyId);
}

export function describeOperatingMode(mode: CompanyOperatingMode): string {
  switch (mode) {
    case "STANDALONE":
      return "Single company (micro default)";
    case "GROUP_MEMBER":
      return "Member of management group (no wildcard data access)";
    case "INDEPENDENT":
      return "Independent company among many (no auto cross-leak)";
    default:
      return mode;
  }
}
