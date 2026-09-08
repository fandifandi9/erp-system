/**
 * Phase 35I — Read optional access context attached to auth user/session model.
 */

import { SESSION_MODULE_WEB_PATHS_FIELD, SESSION_DESK_MODULE_IDS_FIELD, SESSION_MODULE_ASSIGNMENTS_ENRICHED_FIELD } from "@/lib/access/collections";
import type { ModuleId, UserAccessContext } from "@/lib/access/types";

const ACCESS_CONTEXT_FIELD = "_accessContext";

/** Lightweight session fields for client/middleware — no full context blob in cookie. */
export function attachAccessContextToUser(
  user: Record<string, unknown>,
  context: UserAccessContext,
  moduleOnlyWebPaths: string[],
): Record<string, unknown> {
  return {
    ...user,
    [SESSION_MODULE_WEB_PATHS_FIELD]: moduleOnlyWebPaths,
    [SESSION_DESK_MODULE_IDS_FIELD]: [...context.deskModuleIds],
    [SESSION_MODULE_ASSIGNMENTS_ENRICHED_FIELD]: true,
  };
}

/** Attach full context for server-side handlers (not for HttpOnly cookie). */
export function attachFullAccessContextToUser(
  user: Record<string, unknown>,
  context: UserAccessContext,
  moduleOnlyWebPaths: string[],
): Record<string, unknown> {
  return {
    ...attachAccessContextToUser(user, context, moduleOnlyWebPaths),
    [ACCESS_CONTEXT_FIELD]: context,
  };
}

export function readAccessContextFromUser(
  user: Record<string, unknown> | null | undefined,
): UserAccessContext | null {
  if (!user) return null;
  const raw = user[ACCESS_CONTEXT_FIELD];
  if (!raw || typeof raw !== "object") return null;
  return raw as UserAccessContext;
}

export function readDeskModuleIdsFromUser(
  user: Record<string, unknown> | null | undefined,
): Set<ModuleId> {
  const fromContext = readAccessContextFromUser(user)?.deskModuleIds;
  if (fromContext?.size) return fromContext;
  const raw = user?.[SESSION_DESK_MODULE_IDS_FIELD];
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id): id is ModuleId => typeof id === "string"));
}

export function isSessionModuleAccessEnriched(
  user: Record<string, unknown> | null | undefined,
): boolean {
  return user?.[SESSION_MODULE_ASSIGNMENTS_ENRICHED_FIELD] === true;
}

export function readModuleWebPathsFromUser(
  user: Record<string, unknown> | null | undefined,
): string[] {
  if (!user) return [];
  const direct = user[SESSION_MODULE_WEB_PATHS_FIELD];
  if (Array.isArray(direct)) {
    return direct.filter((p): p is string => typeof p === "string" && p.startsWith("/"));
  }
  return [];
}

/** Saat authRefresh/getOne menimpa model — pertahankan field enrichment sementara. */
export function mergeAuthModelPreservingModuleAccess(
  pbRecord: Record<string, unknown>,
  previous?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!previous?.[SESSION_MODULE_ASSIGNMENTS_ENRICHED_FIELD]) {
    return pbRecord;
  }
  const merged: Record<string, unknown> = {
    ...pbRecord,
    [SESSION_MODULE_WEB_PATHS_FIELD]: previous[SESSION_MODULE_WEB_PATHS_FIELD],
    [SESSION_DESK_MODULE_IDS_FIELD]: previous[SESSION_DESK_MODULE_IDS_FIELD],
    [SESSION_MODULE_ASSIGNMENTS_ENRICHED_FIELD]: previous[SESSION_MODULE_ASSIGNMENTS_ENRICHED_FIELD],
  };
  // FLEX-ORG-01 — preserve Position→workspace session fields
  if (previous.active_workspace_domain !== undefined) {
    merged.active_workspace_domain = previous.active_workspace_domain;
  }
  if (previous.active_org_position_id !== undefined) {
    merged.active_org_position_id = previous.active_org_position_id;
  }
  if (previous.active_org_position_name !== undefined) {
    merged.active_org_position_name = previous.active_org_position_name;
  }
  if (previous.org_workspace_enriched !== undefined) {
    merged.org_workspace_enriched = previous.org_workspace_enriched;
  }
  return merged;
}

/** Pilih model client yang punya module access enrichment (hindari race raw PB record). */
export function resolveClientAccessUser(
  authStoreModel: Record<string, unknown> | null | undefined,
  sessionUser?: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const candidates = [authStoreModel, sessionUser].filter(
    (u): u is Record<string, unknown> => Boolean(u && typeof u === "object"),
  );
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestPathCount = readModuleWebPathsFromUser(best).length;

  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    const pathCount = readModuleWebPathsFromUser(candidate).length;
    if (pathCount > bestPathCount) {
      best = candidate;
      bestPathCount = pathCount;
    } else if (
      pathCount === bestPathCount &&
      pathCount === 0 &&
      isSessionModuleAccessEnriched(candidate) &&
      !isSessionModuleAccessEnriched(best)
    ) {
      best = candidate;
    }
  }

  // Jangan percaya enriched flag jika module_web_paths kosong — pilih kandidat lain jika ada path lebih baik.
  if (
    isSessionModuleAccessEnriched(best) &&
    bestPathCount === 0 &&
    candidates.length > 1
  ) {
    for (const candidate of candidates) {
      if (candidate === best) continue;
      const pathCount = readModuleWebPathsFromUser(candidate).length;
      if (pathCount > 0) return candidate;
    }
  }

  return best;
}
