/**
 * Phase FLEX-ORG-01 — Load active org assignment → position workspace domain (server).
 */

import type PocketBase from "pocketbase";
import { HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION } from "@/lib/hr/org-assignment-types";
import { HR_ORG_POSITIONS_COLLECTION } from "@/lib/hr/org-position-types";
import { parseWorkspaceDomain, type WorkspaceDomain } from "@/lib/org/workspace-domain";
import {
  SESSION_ACTIVE_ORG_POSITION_ID_FIELD,
  SESSION_ACTIVE_ORG_POSITION_NAME_FIELD,
  SESSION_ACTIVE_WORKSPACE_DOMAIN_FIELD,
  SESSION_ORG_WORKSPACE_ENRICHED_FIELD,
} from "@/lib/org/resolve-primary-workspace";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function relationId(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && "id" in raw) {
    const id = String((raw as { id: unknown }).id ?? "").trim();
    return id || null;
  }
  return null;
}

export type ActiveOrgWorkspaceContext = {
  positionId: string | null;
  positionName: string | null;
  workspaceDomain: WorkspaceDomain | null;
  companyId: string | null;
};

/**
 * Prefer single active assignment (1 employee = 1 active company seat).
 * If multiple active rows exist (legacy anomaly), prefer active_company match, else first.
 */
export async function loadActiveOrgWorkspaceContext(
  adminPb: PocketBase,
  userId: string,
  preferredCompanyId?: string | null,
): Promise<ActiveOrgWorkspaceContext> {
  const uid = userId.trim();
  if (!uid) {
    return { positionId: null, positionName: null, workspaceDomain: null, companyId: null };
  }

  try {
    const rows = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList({
      filter: `user = "${pbEscape(uid)}" && is_active = true`,
      sort: "-created",
      requestKey: null,
    });
    if (rows.length === 0) {
      return { positionId: null, positionName: null, workspaceDomain: null, companyId: null };
    }

    const preferred = preferredCompanyId?.trim();
    const chosen =
      (preferred
        ? rows.find((r) => relationId((r as Record<string, unknown>).company) === preferred)
        : null) ?? rows[0];

    const companyId = relationId((chosen as Record<string, unknown>).company);
    const positionId = relationId((chosen as Record<string, unknown>).org_position);
    if (!positionId) {
      return { positionId: null, positionName: null, workspaceDomain: null, companyId };
    }

    const pos = (await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).getOne(positionId, {
      requestKey: null,
    })) as unknown as Record<string, unknown>;

    return {
      positionId,
      positionName: String(pos.name ?? "").trim() || null,
      workspaceDomain: parseWorkspaceDomain(pos.workspace_domain),
      companyId,
    };
  } catch {
    return { positionId: null, positionName: null, workspaceDomain: null, companyId: null };
  }
}

/** Attach org workspace fields onto session user (cookie-safe scalars). */
export function attachOrgWorkspaceToUser(
  user: Record<string, unknown>,
  ctx: ActiveOrgWorkspaceContext,
): Record<string, unknown> {
  return {
    ...user,
    [SESSION_ACTIVE_WORKSPACE_DOMAIN_FIELD]: ctx.workspaceDomain,
    [SESSION_ACTIVE_ORG_POSITION_ID_FIELD]: ctx.positionId,
    [SESSION_ACTIVE_ORG_POSITION_NAME_FIELD]: ctx.positionName,
    [SESSION_ORG_WORKSPACE_ENRICHED_FIELD]: true,
  };
}

export async function enrichUserWithOrgWorkspaceContext(
  adminPb: PocketBase,
  user: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const userId = String(user.id ?? "").trim();
  const preferredCompany =
    String(user.active_company ?? user.default_company ?? "").trim() || null;
  const ctx = await loadActiveOrgWorkspaceContext(adminPb, userId, preferredCompany);
  return attachOrgWorkspaceToUser(user, ctx);
}
