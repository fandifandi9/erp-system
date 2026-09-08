/**
 * Phase FLEX-ORG-01 — Company operating models (Multi Company foundation).
 *
 * MODEL 1 STANDALONE — single company, micro-friendly default
 * MODEL 2 GROUP_MEMBER — member of a management group (not wildcard permission)
 * MODEL 3 INDEPENDENT — multiple companies without shared group; no auto cross-leak
 *
 * Group membership ≠ cross-company data access.
 * Access still requires capability + org authority + entity scope.
 */

export const COMPANY_OPERATING_MODES = [
  "STANDALONE",
  "GROUP_MEMBER",
  "INDEPENDENT",
] as const;

export type CompanyOperatingMode = (typeof COMPANY_OPERATING_MODES)[number];

export function parseCompanyOperatingMode(raw: unknown): CompanyOperatingMode {
  const v = String(raw ?? "STANDALONE").trim().toUpperCase();
  if (v === "GROUP_MEMBER" || v === "GROUP") return "GROUP_MEMBER";
  if (v === "INDEPENDENT") return "INDEPENDENT";
  return "STANDALONE";
}

export type CompanyOperatingProfile = {
  companyId: string;
  operatingMode: CompanyOperatingMode;
  /** Management group id when GROUP_MEMBER (optional relation). */
  managementGroupId: string | null;
};

/**
 * Cross-company visibility is never implied by operating mode alone.
 * STANDALONE / INDEPENDENT → only explicit membership/scope.
 * GROUP_MEMBER → still requires explicit entity scope / org authority for data.
 */
export function operatingModeImpliesCrossCompanyAccess(_mode: CompanyOperatingMode): false {
  return false;
}
