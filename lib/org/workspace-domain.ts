/**
 * Phase FLEX-ORG-01 — Functional workspace domains.
 * Domain = ERP functional area, NEVER jabatan title string.
 */

export const WORKSPACE_DOMAINS = [
  "hr",
  "finance",
  "warehouse",
  "purchasing",
  "sales",
  "pos",
  "director",
  "general",
] as const;

export type WorkspaceDomain = (typeof WORKSPACE_DOMAINS)[number];

export function isWorkspaceDomain(value: unknown): value is WorkspaceDomain {
  return typeof value === "string" && (WORKSPACE_DOMAINS as readonly string[]).includes(value);
}

export function parseWorkspaceDomain(raw: unknown): WorkspaceDomain | null {
  if (raw == null || raw === "") return null;
  const v = String(raw).trim().toLowerCase();
  return isWorkspaceDomain(v) ? v : null;
}

/** Desktop primary home for a functional domain. */
export function homeRouteForWorkspaceDomain(domain: WorkspaceDomain): string {
  switch (domain) {
    case "hr":
      return "/hr";
    case "finance":
      return "/keuangan";
    case "warehouse":
      return "/gudang";
    case "purchasing":
      return "/pembelian";
    case "sales":
      return "/penjualan";
    case "pos":
      return "/pos";
    case "director":
      return "/dashboard-director";
    case "general":
      return "/dashboard-staff";
    default: {
      const _exhaustive: never = domain;
      return _exhaustive;
    }
  }
}

/** Map domain → WorkspaceId used by shell configs (compat with existing ids). */
export function workspaceIdForDomain(
  domain: WorkspaceDomain,
): "hr" | "accounting" | "warehouse" | "purchasing" | "sales" | "pos" | "director" | "staff" {
  switch (domain) {
    case "hr":
      return "hr";
    case "finance":
      return "accounting";
    case "warehouse":
      return "warehouse";
    case "purchasing":
      return "purchasing";
    case "sales":
      return "sales";
    case "pos":
      return "pos";
    case "director":
      return "director";
    case "general":
      return "staff";
    default: {
      const _exhaustive: never = domain;
      return _exhaustive;
    }
  }
}

export const WORKSPACE_DOMAIN_LABELS: Record<WorkspaceDomain, string> = {
  hr: "HR / SDM",
  finance: "Finance",
  warehouse: "Warehouse",
  purchasing: "Purchasing",
  sales: "Sales",
  pos: "POS",
  director: "Director / Management",
  general: "General / Staff",
};
