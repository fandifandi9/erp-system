/**
 * Phase FLEX-ORG-04-UI-02 — Simplified FOM UX (Active/Inactive + entity selection).
 * Run: npm run test:flex-org-04-ui
 */

import fs from "fs";
import path from "path";

const root = process.cwd();

let passed = 0;
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  ✓", msg);
  } else {
    failed++;
    console.log("  ✗", msg);
  }
}

/** Inline copy of lib/org/fom-ui-mapping.ts for pure unit assertions. */
function backendFomToUi(input) {
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

function uiFomToBackend(input) {
  if (input.status === "inactive") {
    return {
      mode: "SEPARATED",
      sharedScopeKind: "ALL_IN_MANAGEMENT",
      selectedEntityIds: [],
    };
  }
  const membership = new Set(input.activeMembershipIds.filter(Boolean));
  const selected = [
    ...new Set(
      input.managedEntityIds.map((x) => String(x).trim()).filter((id) => membership.has(id)),
    ),
  ];
  if (selected.length === 0) {
    return { error: "ACTIVE_REQUIRES_ENTITY" };
  }
  const allSelected =
    membership.size > 0 &&
    selected.length === membership.size &&
    [...membership].every((id) => selected.includes(id));
  if (allSelected) {
    return { mode: "SHARED", sharedScopeKind: "ALL_IN_MANAGEMENT", selectedEntityIds: [] };
  }
  return { mode: "SHARED", sharedScopeKind: "SELECTED", selectedEntityIds: selected };
}

function resolveSharedOperationalCandidates(input) {
  const management = new Set(input.managementEntityIds.filter(Boolean));
  if (input.mode === "SEPARATED") return [];
  if (input.sharedScopeKind === "ALL_IN_MANAGEMENT") return [...management];
  return input.selectedEntityIds.filter((id) => management.has(id));
}

console.log("=== PHASE FLEX-ORG-04-UI-02 — SIMPLIFIED FOM UX ===\n");

console.log("CASE — Active / Inactive presentation mapping");
{
  const members = ["pt-a", "pt-b", "cv-c"];
  const activeAll = backendFomToUi({
    mode: "SHARED",
    sharedScopeKind: "ALL_IN_MANAGEMENT",
    selectedEntityIds: [],
    activeMembershipIds: members,
  });
  assert(activeAll.status === "active", "Active function maps from SHARED ALL");
  assert(activeAll.managedEntityIds.join(",") === members.join(","), "Active shows all members");

  const inactive = backendFomToUi({
    mode: "SEPARATED",
    sharedScopeKind: "ALL_IN_MANAGEMENT",
    selectedEntityIds: [],
    activeMembershipIds: members,
  });
  assert(inactive.status === "inactive", "Inactive function maps from SEPARATED");
  assert(inactive.managedEntityIds.length === 0, "Inactive has no managed entities (UI dash)");
}

console.log("\nCASE — Entity selection → backend semantic");
{
  const members = ["A", "B", "C"];
  const all = uiFomToBackend({
    status: "active",
    managedEntityIds: ["A", "B", "C"],
    activeMembershipIds: members,
  });
  assert(
    !("error" in all) && all.mode === "SHARED" && all.sharedScopeKind === "ALL_IN_MANAGEMENT",
    "Active + all entities → ALL_ACTIVE_MANAGEMENT_ENTITIES (ALL_IN_MANAGEMENT)",
  );

  const partial = uiFomToBackend({
    status: "active",
    managedEntityIds: ["A", "B"],
    activeMembershipIds: members,
  });
  assert(
    !("error" in partial) &&
      partial.mode === "SHARED" &&
      partial.sharedScopeKind === "SELECTED" &&
      partial.selectedEntityIds.join(",") === "A,B",
    "Active + partial → SELECTED",
  );

  const empty = uiFomToBackend({
    status: "active",
    managedEntityIds: [],
    activeMembershipIds: members,
  });
  assert("error" in empty && empty.error === "ACTIVE_REQUIRES_ENTITY", "Active + zero entity rejected");

  const off = uiFomToBackend({
    status: "inactive",
    managedEntityIds: ["A"],
    activeMembershipIds: members,
  });
  assert(
    !("error" in off) && off.mode === "SEPARATED" && off.selectedEntityIds.length === 0,
    "Inactive → SEPARATED, no selected entities",
  );
}

console.log("\nCASE — Membership / active isolation");
{
  const mapped = uiFomToBackend({
    status: "active",
    managedEntityIds: ["A", "other-mgmt", "inactive-x"],
    activeMembershipIds: ["A", "B"],
  });
  assert(
    !("error" in mapped) &&
      mapped.sharedScopeKind === "SELECTED" &&
      mapped.selectedEntityIds.join(",") === "A",
    "Selected entity must belong to Management (others stripped)",
  );

  const sepOps = resolveSharedOperationalCandidates({
    mode: "SEPARATED",
    managementEntityIds: ["A", "B"],
    sharedScopeKind: "ALL_IN_MANAGEMENT",
    selectedEntityIds: [],
    employmentCompanyId: "A",
  });
  assert(sepOps.length === 0, "Inactive (SEPARATED) has no operational candidates");
}

console.log("\nCASE — UI surface (no technical / GROUP terminology)");
{
  const page = read("app/(dashboard)/pengaturan/manajemen/page.tsx");
  assert(page.includes("backendFomToUi") && page.includes("uiFomToBackend"), "uses UI↔backend mapping");
  assert(page.includes("statusActive") && page.includes("statusInactive"), "Active/Inactive status");
  assert(page.includes("managedEntitiesCol") || page.includes("managedEntities"), "Managed entities column");
  assert(page.includes("errActiveNeedsEntity"), "empty active validation");
  assert(!page.includes("allInManagement") && !page.includes("selectedEntities"), "no ALL/SELECTED radios");
  assert(!page.includes("Lintas Entitas") && !page.includes("Per Entitas"), "no Lintas/Per Entitas copy");
  assert(!page.includes("Gabung Multi-Company") && !page.includes("Pisah Per Company"), "no GROUP/COMPANY");
  assert(!page.includes("FOM_SHARED_REQUIRES_GROUP"), "no FOM_SHARED_REQUIRES_GROUP");
  assert(!page.includes("role_code"), "no role_code shortcut");
  assert(page.includes("membershipCompanies"), "Management membership display retained");
  assert(!page.includes("setManagementGroupEntities"), "membership API not called from FOM UI");
}

console.log("\nCASE — Mapping module + server validation");
{
  const map = read("lib/org/fom-ui-mapping.ts");
  assert(map.includes("ACTIVE_REQUIRES_ENTITY"), "mapping rejects empty active");
  assert(map.includes("ALL_IN_MANAGEMENT") && map.includes("SELECTED"), "backend kinds preserved");
  const fom = read("lib/org/functional-operating-model.ts");
  assert(
    fom.includes('mode === "SEPARATED"') && fom.includes("return []"),
    "SEPARATED → empty ops candidates",
  );
  const server = read("lib/org/functional-operating-model-server.ts");
  assert(server.includes("FOM_ACTIVE_REQUIRES_ENTITY"), "server rejects active without entity");
  assert(server.includes("filterActiveCompanyIds"), "inactive companies filtered");
  assert(!server.includes("FOM_SHARED_REQUIRES_GROUP"), "no GROUP gate");
}

console.log("\nCASE — Bilingual i18n");
{
  const id = read("lib/i18n/messages/pengaturan-id.ts");
  const en = read("lib/i18n/messages/pengaturan-en.ts");
  assert(id.includes("Struktur Bisnis & Operasional"), "ID header");
  assert(en.includes("Business & Operating Structure"), "EN header");
  assert(id.includes("Entitas yang Dikelola"), "ID managed entities col");
  assert(en.includes("Managed Entities"), "EN managed entities col");
  assert(id.includes("Fungsi aktif harus memiliki minimal satu entitas."), "ID validation");
  assert(en.includes("An active function must have at least one entity."), "EN validation");
  assert(id.includes("Simpan Perubahan"), "ID save");
  assert(en.includes("Save Changes"), "EN save");
  assert(id.includes("Perubahan berhasil disimpan."), "ID success");
  assert(en.includes("Changes saved successfully."), "EN success");
  assert(id.includes("Gagal menyimpan perubahan."), "ID error");
  assert(en.includes("Failed to save changes."), "EN error");
  assert(id.includes("Tidak Aktif"), "ID inactive label");
  assert(en.includes('statusInactive: "Inactive"'), "EN inactive label");
  assert(id.includes("Belum ada entitas yang tersedia."), "ID empty entities");
  assert(en.includes("No entities available."), "EN empty entities");
  assert(id.includes("errActiveNeedsEntity") && en.includes("errActiveNeedsEntity"), "keys present both locales");

  const page = read("app/(dashboard)/pengaturan/manajemen/page.tsx");
  const hardcodedIdHints = [
    "Fungsi aktif harus memiliki minimal satu entitas",
    "Simpan Perubahan",
    "Entitas yang Dikelola",
    "Tidak Aktif",
  ];
  for (const s of hardcodedIdHints) {
    assert(!page.includes(`"${s}"`) && !page.includes(`'${s}'`), `no hardcoded ID string: ${s}`);
  }
}

console.log("\nCASE — Multiple Management isolation (source)");
{
  const page = read("app/(dashboard)/pengaturan/manajemen/page.tsx");
  assert(page.includes("selectedId") && page.includes("setSelectedId"), "Management selector");
  assert(
    page.includes("membershipCompanies") && page.includes("selected?.entityIds"),
    "entity list scoped to selected Management",
  );
  const server = read("lib/org/functional-operating-model-server.ts");
  assert(server.includes("listEntityIdsForManagementGroup"), "server scopes to Management");
}

console.log("\nCASE — Company activation / membership not mutated by FOM");
{
  const server = read("lib/org/functional-operating-model-server.ts");
  assert(!server.includes("setManagementGroupEntities"), "FOM save does not change membership");
  const page = read("app/(dashboard)/pengaturan/manajemen/page.tsx");
  assert(page.includes("/pengaturan/perusahaan"), "company activation remains on Perusahaan");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);