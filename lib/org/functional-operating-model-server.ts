/**
 * Phase FLEX-ORG-02 — Functional operating model CRUD + audit (Owner only).
 */

import type PocketBase from "pocketbase";
import {
  FUNCTIONAL_OPERATING_MODEL_AUDIT_COLLECTION,
  FUNCTIONAL_OPERATING_MODEL_ENTITIES_COLLECTION,
  FUNCTIONAL_OPERATING_MODELS_COLLECTION,
} from "@/lib/org/collections";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import {
  CONFIGURABLE_FUNCTION_DOMAINS,
  defaultFunctionalOperatingModelMap,
  isConfigurableFunctionDomain,
  parseFunctionalOperatingMode,
  type ConfigurableFunctionDomain,
  type FunctionalOperatingMode,
  type FunctionalOperatingModelMap,
  type FunctionalOperatingModelRecord,
} from "@/lib/org/functional-operating-model";
import { listEntityIdsForManagementGroup } from "@/lib/org/management-group-server";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function collectionExists(adminPb: PocketBase, name: string): Promise<boolean> {
  try {
    await adminPb.collections.getOne(name);
    return true;
  } catch {
    return false;
  }
}

function mapModel(
  row: Record<string, unknown>,
  selectedEntityIds: string[],
): FunctionalOperatingModelRecord {
  const domainRaw = String(row.function_domain ?? "").trim();
  const domain = isConfigurableFunctionDomain(domainRaw) ? domainRaw : "hr";
  const scopeKind =
    String(row.shared_scope_kind ?? "ALL_IN_MANAGEMENT").toUpperCase() === "SELECTED"
      ? "SELECTED"
      : "ALL_IN_MANAGEMENT";
  return {
    id: String(row.id ?? ""),
    managementGroupId: String(
      typeof row.management_group === "string"
        ? row.management_group
        : (row.management_group as { id?: string })?.id ?? "",
    ),
    functionDomain: domain,
    mode: parseFunctionalOperatingMode(row.mode),
    sharedScopeKind: scopeKind,
    selectedEntityIds,
    effectiveFrom: row.effective_from ? String(row.effective_from).slice(0, 10) : null,
    notes: String(row.notes ?? "").trim() || undefined,
    updatedBy: row.updated_by != null ? String(row.updated_by) : null,
  };
}

async function loadSelectedEntities(
  adminPb: PocketBase,
  modelId: string,
): Promise<string[]> {
  if (!(await collectionExists(adminPb, FUNCTIONAL_OPERATING_MODEL_ENTITIES_COLLECTION))) {
    return [];
  }
  const rows = await adminPb.collection(FUNCTIONAL_OPERATING_MODEL_ENTITIES_COLLECTION).getFullList({
    filter: `operating_model = "${pbEscape(modelId)}"`,
    requestKey: null,
  });
  return rows
    .map((r) => {
      const c = (r as Record<string, unknown>).company;
      if (typeof c === "string") return c.trim();
      if (c && typeof c === "object" && "id" in c) return String((c as { id: string }).id);
      return "";
    })
    .filter(Boolean);
}

export async function listFunctionalOperatingModels(
  adminPb: PocketBase,
  managementGroupId: string,
): Promise<FunctionalOperatingModelRecord[]> {
  const gid = managementGroupId.trim();
  if (!gid) return [];
  if (!(await collectionExists(adminPb, FUNCTIONAL_OPERATING_MODELS_COLLECTION))) return [];

  const rows = await adminPb.collection(FUNCTIONAL_OPERATING_MODELS_COLLECTION).getFullList({
    filter: `management_group = "${pbEscape(gid)}"`,
    requestKey: null,
  });
  const out: FunctionalOperatingModelRecord[] = [];
  for (const row of rows) {
    const selected = await loadSelectedEntities(adminPb, row.id);
    out.push(mapModel(row as unknown as Record<string, unknown>, selected));
  }
  return out;
}

export async function getFunctionalOperatingModelMap(
  adminPb: PocketBase,
  managementGroupId: string,
): Promise<FunctionalOperatingModelMap> {
  const map = defaultFunctionalOperatingModelMap();
  const rows = await listFunctionalOperatingModels(adminPb, managementGroupId);
  for (const row of rows) {
    map[row.functionDomain] = row.mode;
  }
  return map;
}

export type UpsertFunctionalOperatingModelInput = {
  managementGroupId: string;
  functionDomain: ConfigurableFunctionDomain;
  mode: FunctionalOperatingMode;
  sharedScopeKind?: "ALL_IN_MANAGEMENT" | "SELECTED";
  selectedEntityIds?: string[];
  effectiveFrom: string;
  notes?: string;
};

export async function upsertFunctionalOperatingModel(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: UpsertFunctionalOperatingModelInput,
): Promise<FunctionalOperatingModelRecord> {
  if (!ctx.isOwner) throw new HrApiError("Hanya Owner/Super Admin.", 403);
  if (!(await collectionExists(adminPb, FUNCTIONAL_OPERATING_MODELS_COLLECTION))) {
    throw new HrApiError("Koleksi functional operating models belum dimigrasi (local).", 503);
  }

  const gid = input.managementGroupId.trim();
  const domain = input.functionDomain;
  if (!gid || !isConfigurableFunctionDomain(domain)) {
    throw new HrApiError("Management group dan domain fungsi wajib.", 400);
  }
  const effectiveFrom = String(input.effectiveFrom ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    throw new HrApiError("Tanggal efektif wajib (YYYY-MM-DD).", 400);
  }

  const mode = parseFunctionalOperatingMode(input.mode);
  const sharedScopeKind =
    mode === "SHARED" && input.sharedScopeKind === "SELECTED"
      ? "SELECTED"
      : "ALL_IN_MANAGEMENT";

  const managementEntities = await listEntityIdsForManagementGroup(adminPb, gid);
  const { filterActiveCompanyIds } = await import("@/lib/hr/company-scope");
  const activeManagementEntities = await filterActiveCompanyIds(adminPb, managementEntities);
  const managementSet = new Set(activeManagementEntities);
  let selected = [...new Set((input.selectedEntityIds ?? []).map((x) => String(x).trim()).filter(Boolean))];
  if (mode === "SHARED" && sharedScopeKind === "SELECTED") {
    selected = selected.filter((id) => managementSet.has(id));
    if (selected.length === 0) {
      throw new HrApiError(
        "Fungsi aktif harus memiliki minimal satu entitas.",
        400,
        "FOM_ACTIVE_REQUIRES_ENTITY",
      );
    }
  } else if (mode === "SHARED" && sharedScopeKind === "ALL_IN_MANAGEMENT") {
    selected = [];
    if (activeManagementEntities.length === 0) {
      throw new HrApiError(
        "Fungsi aktif harus memiliki minimal satu entitas.",
        400,
        "FOM_ACTIVE_REQUIRES_ENTITY",
      );
    }
  } else {
    // SEPARATED / inactive — no selected entity rows
    selected = [];
  }

  const existing = await adminPb.collection(FUNCTIONAL_OPERATING_MODELS_COLLECTION).getList(1, 1, {
    filter: `management_group = "${pbEscape(gid)}" && function_domain = "${pbEscape(domain)}"`,
    requestKey: null,
  });

  const payload = {
    management_group: gid,
    function_domain: domain,
    mode,
    shared_scope_kind: sharedScopeKind,
    effective_from: effectiveFrom,
    notes: String(input.notes ?? "").trim(),
    updated_by: ctx.userId,
  };

  let row: Record<string, unknown>;
  let previousMode: string | null = null;
  if (existing.items[0]) {
    previousMode = String((existing.items[0] as Record<string, unknown>).mode ?? "");
    row = (await adminPb
      .collection(FUNCTIONAL_OPERATING_MODELS_COLLECTION)
      .update(existing.items[0].id, payload, { requestKey: null })) as unknown as Record<
      string,
      unknown
    >;
  } else {
    row = (await adminPb
      .collection(FUNCTIONAL_OPERATING_MODELS_COLLECTION)
      .create(payload, { requestKey: null })) as unknown as Record<string, unknown>;
  }

  // Replace selected entities
  if (await collectionExists(adminPb, FUNCTIONAL_OPERATING_MODEL_ENTITIES_COLLECTION)) {
    const old = await adminPb.collection(FUNCTIONAL_OPERATING_MODEL_ENTITIES_COLLECTION).getFullList({
      filter: `operating_model = "${pbEscape(String(row.id))}"`,
      requestKey: null,
    });
    for (const o of old) {
      await adminPb.collection(FUNCTIONAL_OPERATING_MODEL_ENTITIES_COLLECTION).delete(o.id, {
        requestKey: null,
      });
    }
    for (const companyId of selected) {
      await adminPb.collection(FUNCTIONAL_OPERATING_MODEL_ENTITIES_COLLECTION).create(
        { operating_model: row.id, company: companyId },
        { requestKey: null },
      );
    }
  }

  // Audit trail — no retroactive rewrite of historical transactions
  if (await collectionExists(adminPb, FUNCTIONAL_OPERATING_MODEL_AUDIT_COLLECTION)) {
    await adminPb.collection(FUNCTIONAL_OPERATING_MODEL_AUDIT_COLLECTION).create(
      {
        management_group: gid,
        function_domain: domain,
        previous_mode: previousMode,
        new_mode: mode,
        effective_from: effectiveFrom,
        changed_by: ctx.userId,
        notes: String(input.notes ?? "").trim(),
      },
      { requestKey: null },
    );
  }

  return mapModel(row, selected);
}

export async function ensureDefaultFunctionalModels(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  managementGroupId: string,
  effectiveFrom: string,
): Promise<FunctionalOperatingModelRecord[]> {
  const out: FunctionalOperatingModelRecord[] = [];
  for (const domain of CONFIGURABLE_FUNCTION_DOMAINS) {
    const existing = await listFunctionalOperatingModels(adminPb, managementGroupId);
    const found = existing.find((m) => m.functionDomain === domain);
    if (found) {
      out.push(found);
      continue;
    }
    out.push(
      await upsertFunctionalOperatingModel(adminPb, ctx, {
        managementGroupId,
        functionDomain: domain,
        mode: "SEPARATED",
        effectiveFrom,
        notes: "Default SEPARATED (micro-safe)",
      }),
    );
  }
  return out;
}
