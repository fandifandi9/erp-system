/**
 * Position company-scope helpers (pure, testable).
 * FLEX-ORG-04 — effective scope comes from position fields only.
 * Global OrgStructureMode (GROUP/COMPANY) is obsolete and must not collapse scope.
 */

import type { OrgPositionRecord } from "@/lib/hr/org-position-types";
import type { PositionScopeType } from "@/lib/hr/org-assignment-types";

/** Effective company ids a position seat covers. */
export function effectivePositionCompanyIds(
  position: Pick<OrgPositionRecord, "companyId" | "scopeType" | "scopeCompanyIds">,
  allAuthorizedCompanyIds?: readonly string[],
): string[] {
  const scope: PositionScopeType = position.scopeType || "SELECTED_COMPANIES";
  if (scope === "GROUP" || scope === "ALL_COMPANIES") {
    return [...(allAuthorizedCompanyIds ?? [])];
  }
  const selected = position.scopeCompanyIds?.length
    ? position.scopeCompanyIds
    : position.companyId
      ? [position.companyId]
      : [];
  return [...new Set(selected.map((x) => String(x || "").trim()).filter(Boolean))];
}

export function companyInPositionScope(
  companyId: string,
  position: Pick<OrgPositionRecord, "companyId" | "scopeType" | "scopeCompanyIds">,
  allAuthorizedCompanyIds?: readonly string[],
): boolean {
  const id = companyId.trim();
  if (!id) return false;
  return effectivePositionCompanyIds(position, allAuthorizedCompanyIds).includes(id);
}

/** Child effective companies must be ⊆ parent effective companies. */
export function isChildScopeSubsetOfParent(
  childEffective: readonly string[],
  parentEffective: readonly string[],
  parentIsGroupWide: boolean,
): boolean {
  if (parentIsGroupWide) return true;
  if (parentEffective.length === 0) return childEffective.length === 0;
  const parentSet = new Set(parentEffective);
  return childEffective.every((id) => parentSet.has(id));
}

/** Position-wide scope (legacy type name GROUP / ALL_COMPANIES) — not global org mode. */
export function isGroupWideScope(scopeType: PositionScopeType): boolean {
  return scopeType === "GROUP" || scopeType === "ALL_COMPANIES";
}
