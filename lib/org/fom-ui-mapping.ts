/**
 * FLEX-ORG-04-UI-02 — UI mapping for simplified function configuration.
 * Super Admin sees Active/Inactive + entity list; backend keeps SHARED/SEPARATED.
 *
 * Active  → SHARED + ALL_IN_MANAGEMENT (all active members) | SELECTED (partial)
 * Inactive → SEPARATED (no Management-shared operational entity list)
 */

import type { FunctionalOperatingMode } from "@/lib/org/functional-operating-model";

export type FomUiStatus = "active" | "inactive";

export type FomUiRow = {
  status: FomUiStatus;
  /** Entity ids managed when active (subset of active Management membership). */
  managedEntityIds: string[];
};

export type FomBackendPayload = {
  mode: FunctionalOperatingMode;
  sharedScopeKind: "ALL_IN_MANAGEMENT" | "SELECTED";
  selectedEntityIds: string[];
};

/** Map stored FOM row → UI status + managed entities. */
export function backendFomToUi(input: {
  mode: FunctionalOperatingMode;
  sharedScopeKind: "ALL_IN_MANAGEMENT" | "SELECTED";
  selectedEntityIds: string[];
  /** Active Management membership entity ids (already is_active filtered). */
  activeMembershipIds: readonly string[];
}): FomUiRow {
  const membership = [...new Set(input.activeMembershipIds.filter(Boolean))];
  if (input.mode !== "SHARED") {
    return { status: "inactive", managedEntityIds: [] };
  }
  if (input.sharedScopeKind === "ALL_IN_MANAGEMENT") {
    return { status: "active", managedEntityIds: membership };
  }
  const selected = input.selectedEntityIds.filter((id) => membership.includes(id));
  return { status: "active", managedEntityIds: selected };
}

/**
 * Map UI → backend payload.
 * Active + empty managedEntityIds is invalid (caller must block save).
 */
export function uiFomToBackend(input: {
  status: FomUiStatus;
  managedEntityIds: readonly string[];
  activeMembershipIds: readonly string[];
}): FomBackendPayload | { error: "ACTIVE_REQUIRES_ENTITY" } {
  if (input.status === "inactive") {
    return {
      mode: "SEPARATED",
      sharedScopeKind: "ALL_IN_MANAGEMENT",
      selectedEntityIds: [],
    };
  }

  const membership = new Set(input.activeMembershipIds.filter(Boolean));
  const selected = [
    ...new Set(input.managedEntityIds.map((x) => String(x).trim()).filter((id) => membership.has(id))),
  ];
  if (selected.length === 0) {
    return { error: "ACTIVE_REQUIRES_ENTITY" };
  }

  const allSelected =
    membership.size > 0 && selected.length === membership.size && [...membership].every((id) => selected.includes(id));

  if (allSelected) {
    return {
      mode: "SHARED",
      sharedScopeKind: "ALL_IN_MANAGEMENT",
      selectedEntityIds: [],
    };
  }

  return {
    mode: "SHARED",
    sharedScopeKind: "SELECTED",
    selectedEntityIds: selected,
  };
}
