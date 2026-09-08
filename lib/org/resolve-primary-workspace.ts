/**
 * Phase FLEX-ORG-01 — Primary workspace resolution (pure, testable).
 *
 * Priority:
 * 1. Owner account
 * 2. Active org assignment → Position.workspaceDomain (SSOT)
 * 3. Legacy/compat: effective module hub / path grant (e.g. HR module → /hr)
 * 4. dashboard_access → staff
 * 5. null
 *
 * role_code alone NEVER wins over an explicit Position workspace domain.
 */

import type { AuthUserShape } from "@/lib/auth-model";
import { normalizeAuthModel } from "@/lib/auth-model";
import {
  homeRouteForWorkspaceDomain,
  parseWorkspaceDomain,
  workspaceIdForDomain,
  type WorkspaceDomain,
} from "@/lib/org/workspace-domain";
import type { WorkspaceId } from "@/lib/workspace/types";

export const SESSION_ACTIVE_WORKSPACE_DOMAIN_FIELD = "active_workspace_domain";
export const SESSION_ACTIVE_ORG_POSITION_ID_FIELD = "active_org_position_id";
/** Nama jabatan struktur organisasi (SSOT display — bukan users.role legacy). */
export const SESSION_ACTIVE_ORG_POSITION_NAME_FIELD = "active_org_position_name";
export const SESSION_ORG_WORKSPACE_ENRICHED_FIELD = "org_workspace_enriched";

export type PrimaryWorkspaceResolution = {
  homeRoute: string | null;
  workspaceId: WorkspaceId | null;
  domain: WorkspaceDomain | null;
  source: "owner" | "position" | "module_hub_compat" | "dashboard_access" | "none";
};

export function readActiveWorkspaceDomainFromUser(
  user: AuthUserShape | Record<string, unknown> | null | undefined,
): WorkspaceDomain | null {
  if (!user) return null;
  return parseWorkspaceDomain((user as Record<string, unknown>)[SESSION_ACTIVE_WORKSPACE_DOMAIN_FIELD]);
}

export function readActiveOrgPositionIdFromUser(
  user: AuthUserShape | Record<string, unknown> | null | undefined,
): string | null {
  if (!user) return null;
  const raw = (user as Record<string, unknown>)[SESSION_ACTIVE_ORG_POSITION_ID_FIELD];
  const id = String(raw ?? "").trim();
  return id || null;
}

export function isOrgWorkspaceEnriched(
  user: AuthUserShape | Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(user && (user as Record<string, unknown>)[SESSION_ORG_WORKSPACE_ENRICHED_FIELD] === true);
}

/**
 * Pure resolver. Callers supply whether module hub `/hr` (or other) is granted.
 * Does not read role_code for primary decisions.
 */
export function resolvePrimaryWorkspace(input: {
  user: AuthUserShape | Record<string, unknown> | null | undefined;
  /** Compat: exact hub path grant from modules/legacy paths (e.g. has /hr). */
  hasHrHubGrant?: boolean;
  /** Optional future hubs when module paths include them. */
  hasFinanceHubGrant?: boolean;
  hasWarehouseHubGrant?: boolean;
}): PrimaryWorkspaceResolution {
  const user = input.user;
  if (!user) {
    return { homeRoute: null, workspaceId: null, domain: null, source: "none" };
  }

  const auth = normalizeAuthModel(user as AuthUserShape);
  if (auth.accountType === "owner") {
    return {
      homeRoute: "/dashboard-owner",
      workspaceId: "owner",
      domain: null,
      source: "owner",
    };
  }

  const positionDomain = readActiveWorkspaceDomainFromUser(user);
  if (positionDomain) {
    return {
      homeRoute: homeRouteForWorkspaceDomain(positionDomain),
      workspaceId: workspaceIdForDomain(positionDomain) as WorkspaceId,
      domain: positionDomain,
      source: "position",
    };
  }

  // Compat layer — module/path hub (NOT role_code). Used when position domain unset.
  if (input.hasHrHubGrant) {
    return {
      homeRoute: "/hr",
      workspaceId: "hr",
      domain: "hr",
      source: "module_hub_compat",
    };
  }
  if (input.hasWarehouseHubGrant) {
    return {
      homeRoute: "/gudang",
      workspaceId: "warehouse",
      domain: "warehouse",
      source: "module_hub_compat",
    };
  }
  if (input.hasFinanceHubGrant) {
    return {
      homeRoute: "/keuangan",
      workspaceId: "accounting",
      domain: "finance",
      source: "module_hub_compat",
    };
  }

  if (auth.dashboardAccess) {
    return {
      homeRoute: "/dashboard-staff",
      workspaceId: "staff",
      domain: "general",
      source: "dashboard_access",
    };
  }

  return { homeRoute: null, workspaceId: null, domain: null, source: "none" };
}

/**
 * Simulate transfer: new position domain replaces previous primary workspace.
 * Pure helper for tests / docs — does not mutate DB.
 */
export function workspaceAfterPositionTransfer(newDomain: WorkspaceDomain): PrimaryWorkspaceResolution {
  return {
    homeRoute: homeRouteForWorkspaceDomain(newDomain),
    workspaceId: workspaceIdForDomain(newDomain) as WorkspaceId,
    domain: newDomain,
    source: "position",
  };
}
