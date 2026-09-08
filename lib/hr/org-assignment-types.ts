/**
 * Phase 35I-F3 — Employee organization assignment types.
 */

export const HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION = "hr_employee_org_assignments";

export const POSITION_SCOPE_TYPES = ["GROUP", "ALL_COMPANIES", "SELECTED_COMPANIES"] as const;
export type PositionScopeType = (typeof POSITION_SCOPE_TYPES)[number];

export type OrgAssignmentRecord = {
  id: string;
  userId: string;
  companyId: string;
  orgPositionId: string;
  isActive: boolean;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  notes?: string;
  /** Optional joins */
  positionName?: string | null;
  companyName?: string | null;
  userName?: string | null;
};

export function parseScopeType(raw: unknown): PositionScopeType {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (s === "GROUP" || s === "ALL_COMPANIES" || s === "SELECTED_COMPANIES") return s;
  // Compatibility default for legacy rows
  return "SELECTED_COMPANIES";
}

export function parseScopeCompanyIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x || "").trim()).filter(Boolean))];
  }
  const s = String(raw ?? "").trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s) as unknown;
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map((x) => String(x || "").trim()).filter(Boolean))];
    }
  } catch {
    /* comma-separated fallback */
  }
  return [...new Set(s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))];
}

export function serializeScopeCompanyIds(ids: string[]): string {
  return JSON.stringify([...new Set(ids.map((x) => String(x || "").trim()).filter(Boolean))]);
}
