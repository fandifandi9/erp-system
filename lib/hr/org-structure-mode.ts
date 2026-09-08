/**
 * Phase 35I-F1 — Organization Structure Mode types (OBSOLETE as runtime SSOT).
 * FLEX-ORG-04 — global GROUP/COMPANY mode is no longer used for authorization.
 * Collection `hr_org_structure_config` may remain for historical local data — do not drop here.
 *
 * Prefer: Management + FOM + position scope + org authority.
 */

export const HR_ORG_STRUCTURE_CONFIG_COLLECTION = "hr_org_structure_config";

/** @deprecated FLEX-ORG-04 — historical enum only */
export const ORG_STRUCTURE_MODES = ["GROUP", "COMPANY"] as const;
/** @deprecated FLEX-ORG-04 */
export type OrgStructureMode = (typeof ORG_STRUCTURE_MODES)[number];

/** @deprecated FLEX-ORG-04 — historical shape */
export type OrgStructureModeState = {
  mode: OrgStructureMode | null;
  configured: boolean;
  locked: boolean;
  hasOrganizationData: boolean;
  configuredAt: string | null;
  configuredByUserId: string | null;
  recordId: string | null;
};

export function isOrgStructureMode(value: unknown): value is OrgStructureMode {
  return value === "GROUP" || value === "COMPANY";
}

export function parseOrgStructureMode(raw: unknown): OrgStructureMode | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (s === "GROUP" || s === "COMPANY") return s;
  return null;
}
