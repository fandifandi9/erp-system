/**
 * Phase FLEX-ORG-02 — Management + functional operating model foundation tests.
 * Run: npm run test:flex-org-02
 */

import fs from "fs";
import path from "path";

const root = process.cwd();
let passed = 0;
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
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

console.log("=== PHASE FLEX-ORG-02 — MANAGEMENT + FUNCTION OPERATING MODEL ===\n");

console.log("CASE — Schema / collections / migrate");
{
  assert(exists("lib/org/collections.ts"), "collections SSOT");
  const col = read("lib/org/collections.ts");
  assert(col.includes("sys_management_groups"), "management_groups collection");
  assert(col.includes("sys_management_group_entities"), "management_group_entities");
  assert(col.includes("sys_functional_operating_models"), "functional_operating_models");
  assert(col.includes("sys_functional_operating_model_audit"), "audit collection");
  assert(exists("scripts/migrate-local-flex-org-02.mjs"), "local migrate script");
  const mig = read("scripts/migrate-local-flex-org-02.mjs");
  assert(mig.includes("serba.space") && mig.includes("BLOCKED"), "prod URL blocked");
  assert(mig.includes("SHARED") && mig.includes("SEPARATED"), "modes in schema");
  assert(!mig.includes("HYBRID"), "HYBRID not a stored mode");
}

console.log("\nCASE — Functional operating model SSOT");
{
  assert(exists("lib/org/functional-operating-model.ts"), "FOM module");
  const f = read("lib/org/functional-operating-model.ts");
  assert(f.includes("SHARED") && f.includes("SEPARATED"), "SHARED/SEPARATED only");
  assert(f.includes("isHybridOperatingState"), "hybrid is resulting state");
  assert(f.includes("resolveSharedOperationalCandidates"), "shared candidates");
  assert(f.includes("rejectOutsideManagement"), "fail-closed outside management");
  assert(
    f.includes('"hr"') &&
      f.includes('"finance"') &&
      f.includes('"sales"') &&
      f.includes('"warehouse"') &&
      f.includes('"purchasing"') &&
      f.includes('"pos"'),
    "configurable domains",
  );
  assert(exists("lib/org/employment-vs-ops-scope.ts"), "employment ≠ ops");
  assert(
    read("lib/org/employment-vs-ops-scope.ts").includes("Employment company"),
    "employment distinct docs",
  );
  assert(exists("lib/org/resolve-operational-entity-scope.ts"), "ops scope resolver");
}

console.log("\nCASE — Management server + APIs (Owner only)");
{
  assert(exists("lib/org/management-group-server.ts"), "management server");
  assert(exists("lib/org/functional-operating-model-server.ts"), "FOM server");
  const apiMg = read("app/api/org/management-groups/route.ts");
  assert(apiMg.includes("isOwner"), "management API owner-gated");
  const apiFom = read("app/api/org/functional-operating-models/route.ts");
  assert(apiFom.includes("isOwner"), "FOM API owner-gated");
  assert(apiFom.includes("effectiveFrom") || apiFom.includes("effective_from"), "effective date");
  assert(
    read("lib/org/functional-operating-model-server.ts").includes("FUNCTIONAL_OPERATING_MODEL_AUDIT"),
    "audit on change",
  );
}

console.log("\nCASE — Position workspace_domain UI + API");
{
  const post = read("app/api/hr/org-positions/route.ts");
  assert(post.includes("workspaceDomain"), "POST wires workspaceDomain");
  const patch = read("app/api/hr/org-positions/[id]/route.ts");
  assert(patch.includes("workspaceDomain"), "PATCH wires workspaceDomain");
  const ui = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(ui.includes("formWorkspaceDomain") || ui.includes("workspaceDomain"), "Position UI domain");
  assert(ui.includes("WORKSPACE_DOMAINS"), "structured domain select");
  assert(ui.includes("useLocale"), "bilingual hook on org UI");
}

console.log("\nCASE — Super Admin configuration UI");
{
  assert(exists("app/(dashboard)/pengaturan/manajemen/page.tsx"), "manajemen page");
  const page = read("app/(dashboard)/pengaturan/manajemen/page.tsx");
  assert(page.includes("errOwnerOnly") || page.includes("isOwner"), "owner-only UI");
  assert(
    page.includes("statusActive") && page.includes("statusInactive") && page.includes("uiFomToBackend"),
    "Active/Inactive + entity mapping (FLEX-ORG-04-UI-02)",
  );
  assert(page.includes("effectiveFrom"), "effective date required");
  assert(read("lib/wms/navigation.ts").includes("/pengaturan/manajemen"), "nav entry");
  assert(read("lib/rbac.ts").includes("/pengaturan/manajemen"), "KNOWN_ROUTES");
}

console.log("\nCASE — Bilingual keys ID + EN");
{
  const id = read("lib/i18n/messages/pengaturan-id.ts");
  const en = read("lib/i18n/messages/pengaturan-en.ts");
  for (const key of [
    "management",
    "legalEntity",
    "orgStructure",
    "position",
    "workspace",
    "workspaceDomain",
    "entityScope",
    "shared",
    "separated",
    "operatingModel",
    "functionalDomain",
    "director",
    "save",
    "cancel",
    "edit",
    "create",
  ]) {
    assert(id.includes(`${key}:`), `ID key ${key}`);
    assert(en.includes(`${key}:`), `EN key ${key}`);
  }
  assert(id.includes("Lintas Entitas") && en.includes("Cross-entity"), "Shared terminology");
  assert(id.includes("Per Entitas") && en.includes("Per entity"), "Separated terminology");
  assert(id.includes("Struktur Bisnis") && en.includes("Business Structure"), "page title terminology");
}

console.log("\nCASE — Architecture separations preserved");
{
  assert(read("lib/org/resolve-primary-workspace.ts").includes("role_code alone NEVER"), "role_code never overrides");
  assert(read("lib/org/feature-config.ts").includes("multi_company"), "feature packs retained");
  assert(read("lib/hr/org-authority.ts").includes("positionsUnderOrgAuthority"), "hierarchy authority");
  assert(
    !read("lib/org/functional-operating-model.ts").includes('mode: "HYBRID"'),
    "no HYBRID per-function mode",
  );
}

console.log("\nCASE — Product/pricing NOT implemented (foundation only)");
{
  const fom = read("lib/org/functional-operating-model.ts");
  assert(!fom.includes("stock_transfer") && !fom.includes("createInvoice"), "no transaction modules in FOM");
  assert(
    !exists("app/(dashboard)/produk/master-management/page.tsx"),
    "Product management UI not built in this phase",
  );
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
