/**
 * FLEX-ORG-04 — Global organization mode (GROUP/COMPANY) is OBSOLETE.
 *
 * Collection `hr_org_structure_config` may still exist in local PB for historical
 * data — it is NOT a runtime SSOT. Do not drop in this phase.
 *
 * Hierarchy flexibility comes from:
 * Management membership + FOM + position scope + org authority.
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import {
  HR_ORG_STRUCTURE_CONFIG_COLLECTION,
  isOrgStructureMode,
  parseOrgStructureMode,
  type OrgStructureMode,
  type OrgStructureModeState,
} from "@/lib/hr/org-structure-mode";

function mapState(
  rec: Record<string, unknown> | null,
  hasOrganizationData: boolean,
): OrgStructureModeState {
  const mode = parseOrgStructureMode(rec?.mode);
  const configured = mode != null;
  return {
    mode,
    configured,
    locked: configured && hasOrganizationData,
    hasOrganizationData,
    configuredAt: rec?.configured_at ? String(rec.configured_at) : null,
    configuredByUserId: rec?.configured_by ? String(rec.configured_by) : null,
    recordId: rec?.id ? String(rec.id) : null,
  };
}

async function countOrgPositions(adminPb: PocketBase): Promise<number> {
  try {
    const { HR_ORG_POSITIONS_COLLECTION } = await import("@/lib/hr/org-position-types");
    const rows = await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).getList(1, 1, {
      requestKey: null,
    });
    return Number(rows.totalItems) || 0;
  } catch {
    return 0;
  }
}

async function loadConfigRecord(
  adminPb: PocketBase,
): Promise<Record<string, unknown> | null> {
  try {
    const rows = await adminPb.collection(HR_ORG_STRUCTURE_CONFIG_COLLECTION).getFullList({
      sort: "created",
      requestKey: null,
    });
    return (rows[0] as unknown as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

/**
 * @deprecated FLEX-ORG-04 — historical read only. Not used for authorization.
 */
export async function getOrganizationStructureModeState(
  adminPb: PocketBase,
): Promise<OrgStructureModeState> {
  const [rec, count] = await Promise.all([loadConfigRecord(adminPb), countOrgPositions(adminPb)]);
  return mapState(rec, count > 0);
}

/** @deprecated FLEX-ORG-04 */
export async function getOrganizationStructureMode(
  adminPb: PocketBase,
): Promise<OrgStructureMode | null> {
  const state = await getOrganizationStructureModeState(adminPb);
  return state.mode;
}

export function requireOwnerForOrganizationStructureModeChange(
  ctx: HrApiAuthContext,
): void {
  if (!ctx.isOwner) {
    throw new HrApiError(
      "Hanya Owner yang dapat mengubah konfigurasi organisasi.",
      403,
      "ORG_STRUCTURE_MODE_OWNER_ONLY",
    );
  }
}

/**
 * @deprecated FLEX-ORG-04 — global mode gate removed. Kept as no-op for transitional callers.
 */
export async function assertOrganizationStructureModeConfigured(
  _adminPb: PocketBase,
): Promise<OrgStructureMode | null> {
  return null;
}

/**
 * @deprecated FLEX-ORG-04 — writing global GROUP/COMPANY is no longer supported.
 */
export async function setOrganizationStructureMode(
  _adminPb: PocketBase,
  ctx: HrApiAuthContext,
  _input: { mode: OrgStructureMode },
): Promise<OrgStructureModeState> {
  requireOwnerForOrganizationStructureModeChange(ctx);
  throw new HrApiError(
    "Mode struktur organisasi global (GROUP/COMPANY) telah dihapus. Gunakan Management + Model Operasional Fungsi + scope jabatan.",
    410,
    "ORG_STRUCTURE_MODE_OBSOLETE",
  );
}

/**
 * Company filter for org position trees — Management/authorized entities only.
 * Global GROUP/COMPANY mode is ignored (FLEX-ORG-04).
 */
export function resolveOrgStructureCompanyScope(args: {
  /** @deprecated ignored */
  mode?: OrgStructureMode | null;
  isOwner: boolean;
  authorizedCompanyIds: string[];
  workingCompanyIds: string[];
  requestedCompanyId?: string | null;
}): { companyIds: string[]; contextLabel: "management" } {
  const authorized = args.authorizedCompanyIds;
  const requested = String(args.requestedCompanyId ?? "").trim();

  if (requested) {
    if (!args.isOwner && !authorized.includes(requested)) {
      throw new HrApiError("Entitas di luar scope HR Anda.", 403);
    }
    return { companyIds: [requested], contextLabel: "management" };
  }

  return { companyIds: authorized, contextLabel: "management" };
}

export { isOrgStructureMode };
