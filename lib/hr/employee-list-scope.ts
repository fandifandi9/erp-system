/**
 * Phase 35I-G — Employee list company scope resolver.
 * Phase FLEX-ORG-02-FIX — HR operational scope intersects FOM ∩ position ∩ module.
 * FLEX-ORG-04 — no global GROUP/COMPANY mode gate.
 *
 * Separates:
 * - Owner global visibility (+ optional company filter)
 * - Organization authority visibility (Director/Manager holders) ∩ FOM
 * - HR operational visibility (FOM-aware) — HR module alone ≠ global/org authority
 */

import type PocketBase from "pocketbase";
import { getHrEffectiveCompanyIds } from "@/lib/access/hr-api-enforcement";
import type { HrApiAuthContext } from "@/lib/hr/api-auth";
import { positionsUnderOrgAuthority } from "@/lib/hr/org-authority";
import { effectivePositionCompanyIds } from "@/lib/hr/org-position-scope";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";

export type EmployeeListScopeKind =
  | "owner_all"
  | "owner_company"
  | "org_hierarchy"
  | "hr_working";

export type EmployeeListScope = {
  kind: EmployeeListScopeKind;
  companyIds: string[];
  /** Owner may choose; ignored for non-Owner. */
  requestedCompanyId: string | null;
};

function intersectAuthorized(ids: string[], authorized: readonly string[]): string[] {
  const set = new Set(authorized);
  return [...new Set(ids.map((x) => x.trim()).filter((id) => id && set.has(id)))];
}

/**
 * Resolve which companies feed the HR employee list.
 * Never expands beyond authorized (membership ∩ module) ∩ FOM ∩ position.
 */
export async function resolveEmployeeListCompanyScope(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  options?: { companyId?: string | null },
): Promise<EmployeeListScope> {
  const authorized = getHrEffectiveCompanyIds(ctx);
  const requestedRaw = String(options?.companyId ?? "").trim();
  const requested =
    !requestedRaw || requestedRaw.toLowerCase() === "all" ? null : requestedRaw;

  // ——— Owner: global employee visibility (no active-company switch required) ———
  if (ctx.isOwner) {
    if (requested) {
      if (!authorized.includes(requested)) {
        return { kind: "owner_company", companyIds: [], requestedCompanyId: requested };
      }
      return {
        kind: "owner_company",
        companyIds: [requested],
        requestedCompanyId: requested,
      };
    }
    return {
      kind: "owner_all",
      companyIds: [...authorized],
      requestedCompanyId: null,
    };
  }

  const fomOps = await getHrOperationalCompanyIds(adminPb, ctx);

  // Non-Owner: org hierarchy ∩ FOM — ignore client company chooser
  {
    const { listActiveOrgAssignments } = await import("@/lib/hr/org-assignment-server");
    const assignments = await listActiveOrgAssignments(adminPb, ctx.userId);
    if (assignments.length > 0) {
      const companies = new Set<string>();
      for (const a of assignments) {
        if (authorized.includes(a.companyId)) companies.add(a.companyId);
      }

      try {
        const { serverListOrgPositions } = await import("@/lib/hr/org-position-server");
        const positions = await serverListOrgPositions(adminPb, ctx, null);
        const flat = positions.map((p) => ({
          id: p.id,
          parentPositionId: p.parentPositionId,
          holderUserId: p.holderUserId,
          holderUserIds: p.holderUserIds,
        }));
        const under = positionsUnderOrgAuthority(flat, ctx.userId);
        for (const p of positions) {
          const isHeld =
            (p.holderUserIds?.includes(ctx.userId) ?? false) || p.holderUserId === ctx.userId;
          const inSubtree = under.has(p.id);
          if (!isHeld && !inSubtree) continue;
          for (const cid of effectivePositionCompanyIds(p, authorized)) {
            if (authorized.includes(cid)) companies.add(cid);
          }
        }
      } catch {
        /* keep assignment companies only */
      }

      // FOM ∩ org hierarchy (Scenario 9: Shared A+B + position A → A)
      const companyIds = intersectAuthorized([...companies], fomOps);
      if (companyIds.length > 0) {
        return {
          kind: "org_hierarchy",
          companyIds,
          requestedCompanyId: null,
        };
      }
    }
  }

  // HR operational without hierarchy expansion: FOM-aware (kind name kept for compat)
  return {
    kind: "hr_working",
    companyIds: intersectAuthorized(fomOps, authorized),
    requestedCompanyId: null,
  };
}
