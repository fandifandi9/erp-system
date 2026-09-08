/**
 * Phase FLEX-ORG-02 — Per-function Shared / Separated operating model.
 *
 * HYBRID is NOT a per-function mode — it is the resulting state when a Management
 * mixes Shared and Separated functions.
 *
 * Operating model ≠ permission grant.
 * Position → Workspace; Capability → actions; Scope → data; Hierarchy → authority.
 */

import {
  WORKSPACE_DOMAINS,
  type WorkspaceDomain,
  isWorkspaceDomain,
} from "@/lib/org/workspace-domain";

export const FUNCTIONAL_OPERATING_MODES = ["SHARED", "SEPARATED"] as const;
export type FunctionalOperatingMode = (typeof FUNCTIONAL_OPERATING_MODES)[number];

/** Domains that participate in Shared/Separated configuration (not director/general). */
export const CONFIGURABLE_FUNCTION_DOMAINS = [
  "hr",
  "finance",
  "sales",
  "warehouse",
  "purchasing",
  "pos",
] as const satisfies readonly WorkspaceDomain[];

export type ConfigurableFunctionDomain = (typeof CONFIGURABLE_FUNCTION_DOMAINS)[number];

export function isConfigurableFunctionDomain(
  value: unknown,
): value is ConfigurableFunctionDomain {
  return (
    typeof value === "string" &&
    (CONFIGURABLE_FUNCTION_DOMAINS as readonly string[]).includes(value)
  );
}

export function parseFunctionalOperatingMode(raw: unknown): FunctionalOperatingMode {
  const v = String(raw ?? "SEPARATED").trim().toUpperCase();
  return v === "SHARED" ? "SHARED" : "SEPARATED";
}

export type FunctionalOperatingModelRecord = {
  id: string;
  managementGroupId: string;
  functionDomain: ConfigurableFunctionDomain;
  mode: FunctionalOperatingMode;
  /** SHARED only: ALL_IN_MANAGEMENT | SELECTED */
  sharedScopeKind: "ALL_IN_MANAGEMENT" | "SELECTED";
  /** When SELECTED — entity ids within management */
  selectedEntityIds: string[];
  effectiveFrom: string | null;
  notes?: string;
  updatedBy?: string | null;
};

export type FunctionalOperatingModelMap = Record<
  ConfigurableFunctionDomain,
  FunctionalOperatingMode
>;

/** Resulting management state — not a stored mode. */
export function isHybridOperatingState(map: Partial<FunctionalOperatingModelMap>): boolean {
  const modes = CONFIGURABLE_FUNCTION_DOMAINS.map((d) => map[d] ?? "SEPARATED");
  return modes.includes("SHARED") && modes.includes("SEPARATED");
}

export function defaultFunctionalOperatingModelMap(): FunctionalOperatingModelMap {
  return {
    hr: "SEPARATED",
    finance: "SEPARATED",
    sales: "SEPARATED",
    warehouse: "SEPARATED",
    purchasing: "SEPARATED",
    pos: "SEPARATED",
  };
}

/**
 * Resolve candidate operational entity ids for a function under a management.
 * Fail-closed: never expands outside managementEntityIds.
 */
export function resolveSharedOperationalCandidates(input: {
  mode: FunctionalOperatingMode;
  managementEntityIds: string[];
  sharedScopeKind: "ALL_IN_MANAGEMENT" | "SELECTED";
  selectedEntityIds: string[];
  /** Employment / primary company — Separated default */
  employmentCompanyId: string | null;
}): string[] {
  const management = new Set(input.managementEntityIds.filter(Boolean));

  if (input.mode === "SEPARATED") {
    // FLEX-ORG-04-UI-02 — SEPARATED = function inactive at Management FOM layer
    // (no Management-shared operational entity list). Empty fail-closed.
    return [];
  }

  // SHARED
  if (input.sharedScopeKind === "ALL_IN_MANAGEMENT") {
    return [...management];
  }

  // SELECTED — intersect with management (fail-closed)
  return input.selectedEntityIds.filter((id) => management.has(id));
}

/** Reject any entity outside management (Shared never becomes global wildcard). */
export function rejectOutsideManagement(
  candidateIds: string[],
  managementEntityIds: string[],
): string[] {
  const allowed = new Set(managementEntityIds);
  return candidateIds.filter((id) => allowed.has(id));
}

export function parseConfigurableDomain(raw: unknown): ConfigurableFunctionDomain | null {
  if (!isWorkspaceDomain(raw)) return null;
  return isConfigurableFunctionDomain(raw) ? raw : null;
}

/** Domains available for future expansion without rewrite. */
export function listAllWorkspaceDomains(): readonly WorkspaceDomain[] {
  return WORKSPACE_DOMAINS;
}
