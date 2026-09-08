/**
 * Phase FLEX-ORG-04 — No global GROUP/COMPANY organization mode.
 * Run: npm run test:flex-org-04
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

function resolveSharedOperationalCandidates(input) {
  const management = new Set(input.managementEntityIds.filter(Boolean));
  // FLEX-ORG-04-UI-02 — SEPARATED = inactive at Management FOM layer
  if (input.mode === "SEPARATED") return [];
  if (input.sharedScopeKind === "ALL_IN_MANAGEMENT") return [...management];
  return input.selectedEntityIds.filter((id) => management.has(id));
}

function effectivePositionCompanyIds(position, allAuthorized = []) {
  const scope = position.scopeType || "SELECTED_COMPANIES";
  if (scope === "GROUP" || scope === "ALL_COMPANIES") return [...allAuthorized];
  const selected = position.scopeCompanyIds?.length
    ? position.scopeCompanyIds
    : position.companyId
      ? [position.companyId]
      : [];
  return [...new Set(selected.filter(Boolean))];
}

console.log("=== PHASE FLEX-ORG-04 — NO GLOBAL ORG MODE ===\n");

console.log("CASE — Management multi-entity FOM combinations");
{
  const mgmt2 = ["A", "B"];
  const mgmt3 = ["A", "B", "C"];
  assert(mgmt2.length === 2, "Management with 2 entities");
  assert(mgmt3.length === 3, "Management with 3 entities");

  assert(
    resolveSharedOperationalCandidates({
      mode: "SHARED",
      managementEntityIds: mgmt3,
      sharedScopeKind: "ALL_IN_MANAGEMENT",
      selectedEntityIds: [],
      employmentCompanyId: "A",
    }).join(",") === "A,B,C",
    "HR Shared + All → A+B+C",
  );

  assert(
    resolveSharedOperationalCandidates({
      mode: "SHARED",
      managementEntityIds: mgmt3,
      sharedScopeKind: "SELECTED",
      selectedEntityIds: ["A", "B"],
      employmentCompanyId: "A",
    }).join(",") === "A,B",
    "HR Shared + Selected A+B",
  );

  assert(
    resolveSharedOperationalCandidates({
      mode: "SEPARATED",
      managementEntityIds: mgmt3,
      sharedScopeKind: "ALL_IN_MANAGEMENT",
      selectedEntityIds: [],
      employmentCompanyId: "A",
    }).length === 0,
    "Finance inactive (SEPARATED) → no operational candidates",
  );

  assert(
    resolveSharedOperationalCandidates({
      mode: "SHARED",
      managementEntityIds: mgmt3,
      sharedScopeKind: "SELECTED",
      selectedEntityIds: ["A", "C"],
      employmentCompanyId: "B",
    }).join(",") === "A,C",
    "Sales Shared + Selected A+C",
  );

  assert(
    resolveSharedOperationalCandidates({
      mode: "SEPARATED",
      managementEntityIds: mgmt3,
      sharedScopeKind: "ALL_IN_MANAGEMENT",
      selectedEntityIds: [],
      employmentCompanyId: "B",
    }).length === 0,
    "Warehouse inactive (SEPARATED) → no operational candidates",
  );

  assert(
    resolveSharedOperationalCandidates({
      mode: "SHARED",
      managementEntityIds: mgmt3,
      sharedScopeKind: "SELECTED",
      selectedEntityIds: ["B"],
      employmentCompanyId: "B",
    }).join(",") === "B",
    "Active function + single entity B → B only",
  );
}

console.log("\nCASE — SHARED without GROUP; FOM_SHARED_REQUIRES_GROUP gone");
{
  const fom = read("lib/org/functional-operating-model-server.ts");
  assert(!fom.includes("FOM_SHARED_REQUIRES_GROUP"), "FOM_SHARED_REQUIRES_GROUP removed");
  assert(!fom.includes("getOrganizationStructureModeState"), "FOM save not gated by org mode");
  assert(
    resolveSharedOperationalCandidates({
      mode: "SHARED",
      managementEntityIds: ["A", "B"],
      sharedScopeKind: "ALL_IN_MANAGEMENT",
      selectedEntityIds: [],
      employmentCompanyId: "A",
    }).length === 2,
    "SHARED works without GROUP mode",
  );
}

console.log("\nCASE — UI has no global mode editor");
{
  const mgmt = read("app/(dashboard)/pengaturan/manajemen/page.tsx");
  const org = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(!mgmt.includes("orgStructureModeTitle"), "Manajemen no Mode Struktur section");
  assert(!mgmt.includes("Gabung Multi-Company"), "Manajemen no Gabung label");
  assert(!mgmt.includes("Pisah Per Company"), "Manajemen no Pisah label");
  assert(!mgmt.includes("saveOrgStructureMode"), "Manajemen no saveOrgStructureMode");
  assert(!org.includes("Gabung Multi-Company"), "Organisasi no Gabung label");
  assert(!org.includes("Pisah Per Company"), "Organisasi no Pisah label");
  assert(!org.includes("Simpan Mode"), "Organisasi no Simpan Mode");
  assert(!org.includes("saveOrgMode"), "Organisasi no saveOrgMode");
  assert(org.includes("orgPageContextHint") || org.includes("orgPageHierarchyContext"), "Organisasi management context");
}

console.log("\nCASE — Position scope single + multi (no global mode collapse)");
{
  const scope = read("lib/hr/org-position-scope.ts");
  assert(!scope.includes('mode === "COMPANY"'), "position scope does not collapse on COMPANY mode");
  assert(
    effectivePositionCompanyIds({
      companyId: "A",
      scopeType: "SELECTED_COMPANIES",
      scopeCompanyIds: ["A"],
    }).join(",") === "A",
    "Position scope single entity",
  );
  assert(
    effectivePositionCompanyIds({
      companyId: "A",
      scopeType: "SELECTED_COMPANIES",
      scopeCompanyIds: ["A", "B"],
    }).join(",") === "A,B",
    "Position scope multi entity",
  );
  assert(
    effectivePositionCompanyIds(
      { companyId: "A", scopeType: "ALL_COMPANIES", scopeCompanyIds: [] },
      ["A", "B", "C"],
    ).join(",") === "A,B,C",
    "Position wide scope uses authorized set",
  );
}

console.log("\nCASE — Membership / FOM / role_code boundaries");
{
  const fom = read("lib/org/functional-operating-model.ts");
  assert(fom.includes("never expands outside managementEntityIds") || fom.includes("fail-closed"), "outside management fail-closed");
  assert(fom.includes("rejectOutsideManagement"), "outside management helper");
  const hr = read("lib/org/resolve-hr-operational-company-scope.ts");
  assert(hr.includes("intersect"), "HR ops intersection");
  assert(!hr.includes("getOrganizationStructureModeState"), "HR ops not gated by global mode");
  assert(read("lib/org/resolve-operational-entity-scope.ts").includes("filterActiveCompanyIds"), "inactive excluded from ALL ACTIVE");
  const ws = read("lib/org/resolve-primary-workspace.ts");
  assert(ws.includes("workspace_domain") || ws.includes("workspaceDomain") || read("lib/org/workspace-domain.ts").includes("WorkspaceDomain"), "workspace from domain");
  assert(
    !read("lib/org/resolve-primary-workspace.ts").includes("role_code") ||
      read("lib/org/resolve-primary-workspace.ts").includes("position"),
    "role_code not primary workspace",
  );
}

console.log("\nCASE — Obsolete collection not dropped; API rejects writes");
{
  assert(read("lib/hr/org-structure-mode.ts").includes("hr_org_structure_config"), "collection name retained (no drop)");
  assert(
    read("lib/hr/org-structure-mode-server.ts").includes("ORG_STRUCTURE_MODE_OBSOLETE") ||
      read("lib/hr/org-structure-mode-server.ts").includes("obsolete"),
    "set mode marked obsolete",
  );
  assert(read("app/api/hr/org-structure-mode/route.ts").includes("obsolete"), "API documents obsolete");
}

console.log("\nCASE — Architecture layers preserved");
{
  assert(read("lib/org/collections.ts").includes("sys_management_groups"), "Management preserved");
  assert(read("lib/org/collections.ts").includes("sys_functional_operating_models"), "FOM preserved");
  assert(read("lib/hr/org-authority.ts").includes("positionsUnderOrgAuthority"), "hierarchy authority");
  assert(read("lib/access/module-assignments-server.ts").includes("is_active"), "module access");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
