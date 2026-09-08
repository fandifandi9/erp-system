/**
 * Phase FLEX-ORG-02 — Resolve operational entity scope for a user + function domain.
 * Fail-closed. Management ≠ universal access. Shared ≠ global wildcard.
 */

import type PocketBase from "pocketbase";
import { getAccessibleCompanyIds, filterActiveCompanyIds } from "@/lib/hr/company-scope";
import type { AuthUserShape } from "@/lib/auth-model";
import {
  parseConfigurableDomain,
  resolveSharedOperationalCandidates,
  type ConfigurableFunctionDomain,
  type FunctionalOperatingMode,
} from "@/lib/org/functional-operating-model";
import {
  getManagementGroupForCompany,
  listEntityIdsForManagementGroup,
} from "@/lib/org/management-group-server";
import { listFunctionalOperatingModels } from "@/lib/org/functional-operating-model-server";
import {
  assertEmploymentDistinctFromOps,
  type EmploymentCompanyContext,
  type OperationalEntityScopeContext,
} from "@/lib/org/employment-vs-ops-scope";
import { listActiveOrgAssignments } from "@/lib/hr/org-assignment-server";

export type ResolveOperationalScopeInput = {
  user: AuthUserShape | Record<string, unknown>;
  functionDomain: ConfigurableFunctionDomain | string;
  /** Override employment company (defaults from active org assignment) */
  employmentCompanyId?: string | null;
};

export type ResolveOperationalScopeResult = {
  employment: EmploymentCompanyContext;
  operational: OperationalEntityScopeContext;
  /** Intersection with membership — ready for data filters */
  authorizedOperationalCompanyIds: string[];
};

export async function resolveOperationalEntityScope(
  adminPb: PocketBase,
  input: ResolveOperationalScopeInput,
): Promise<ResolveOperationalScopeResult> {
  const userId = String(input.user.id ?? "").trim();
  const domain = parseConfigurableDomain(input.functionDomain);

  let employmentCompanyId =
    input.employmentCompanyId != null
      ? String(input.employmentCompanyId).trim() || null
      : null;
  let assignmentId: string | null = null;
  let positionId: string | null = null;

  if (userId) {
    const actives = await listActiveOrgAssignments(adminPb, userId).catch(() => []);
    const preferred =
      (employmentCompanyId
        ? actives.find((a) => a.companyId === employmentCompanyId)
        : null) ?? actives[0];
    if (preferred) {
      employmentCompanyId = preferred.companyId || employmentCompanyId;
      assignmentId = preferred.id;
      positionId = preferred.orgPositionId;
    }
  }

  const employment: EmploymentCompanyContext = {
    employmentCompanyId,
    assignmentId,
    positionId,
  };

  const emptyOps = (mode: FunctionalOperatingMode): ResolveOperationalScopeResult => ({
    employment,
    operational: {
      functionDomain: String(input.functionDomain),
      mode,
      operationalCompanyIds: [],
      managementGroupId: null,
    },
    authorizedOperationalCompanyIds: [],
  });

  if (!domain || !employmentCompanyId) {
    return emptyOps("SEPARATED");
  }

  const membership = await getAccessibleCompanyIds(
    adminPb,
    userId,
    input.user as Record<string, unknown>,
  );
  if (membership.length === 0) {
    return emptyOps("SEPARATED");
  }

  const group = await getManagementGroupForCompany(adminPb, employmentCompanyId);
  // FLEX-ORG-05-FIX — inactive Management → fail-closed (no operational candidates).
  if (group && group.isActive === false) {
    return {
      employment,
      operational: {
        functionDomain: domain,
        mode: "SEPARATED",
        operationalCompanyIds: [],
        managementGroupId: group.id,
      },
      authorizedOperationalCompanyIds: [],
    };
  }
  const rawManagementEntityIds = group
    ? group.entityIds.length > 0
      ? group.entityIds
      : await listEntityIdsForManagementGroup(adminPb, group.id)
    : [employmentCompanyId];

  // ALL / membership candidates: active legal entities only (activation SSOT = Perusahaan).
  const managementEntityIds = await filterActiveCompanyIds(adminPb, rawManagementEntityIds);

  let mode: FunctionalOperatingMode = "SEPARATED";
  let sharedScopeKind: "ALL_IN_MANAGEMENT" | "SELECTED" = "ALL_IN_MANAGEMENT";
  let selectedEntityIds: string[] = [];

  if (group?.id) {
    const models = await listFunctionalOperatingModels(adminPb, group.id);
    const model = models.find((m) => m.functionDomain === domain);
    if (model) {
      mode = model.mode;
      sharedScopeKind = model.sharedScopeKind;
      selectedEntityIds = model.selectedEntityIds;
    }
  }

  // SELECTED also drop inactive (fail-closed).
  const selectedActive =
    sharedScopeKind === "SELECTED"
      ? await filterActiveCompanyIds(adminPb, selectedEntityIds)
      : selectedEntityIds;

  const candidates = resolveSharedOperationalCandidates({
    mode,
    managementEntityIds,
    sharedScopeKind,
    selectedEntityIds: selectedActive,
    employmentCompanyId,
  });

  // Always ∩ membership (fail-closed)
  const membershipSet = new Set(membership);
  const operationalCompanyIds = candidates.filter((id) => membershipSet.has(id));

  assertEmploymentDistinctFromOps({
    employmentCompanyId,
    operationalCompanyIds,
  });

  return {
    employment,
    operational: {
      functionDomain: domain,
      mode,
      operationalCompanyIds,
      managementGroupId: group?.id ?? null,
    },
    authorizedOperationalCompanyIds: operationalCompanyIds,
  };
}
