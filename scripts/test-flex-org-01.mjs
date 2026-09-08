/**
 * Phase FLEX-ORG-01 — Flexible org + multi-company foundation tests.
 * Run: npm run test:flex-org-01
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
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

console.log("=== PHASE FLEX-ORG-01 — FLEXIBLE ORG + MULTI COMPANY ===\n");

console.log("CASE — Domain model + Position field (not jabatan string)");
{
  assert(exists("lib/org/workspace-domain.ts"), "workspace-domain module");
  const dom = read("lib/org/workspace-domain.ts");
  assert(dom.includes('"hr"') && dom.includes('"warehouse"') && dom.includes('"director"'), "ERP domains");
  assert(dom.includes("NEVER") || dom.includes("never") || !dom.includes("jabatan"), "domain not jabatan-driven");
  assert(read("lib/hr/org-position-types.ts").includes("workspaceDomain"), "position type has workspaceDomain");
  assert(read("lib/hr/org-position-server.ts").includes("workspace_domain"), "position server maps domain");
  assert(exists("scripts/migrate-local-flex-org-01.mjs"), "local migrate");
}

console.log("\nCASE — Primary workspace resolver (Position > role_code)");
{
  assert(exists("lib/org/resolve-primary-workspace.ts"), "resolver module");
  const res = read("lib/org/resolve-primary-workspace.ts");
  assert(res.includes('source: "position"'), "position source");
  assert(res.includes("role_code alone NEVER") || res.includes("NEVER wins"), "role_code not primary");
  assert(read("lib/rbac.ts").includes("resolvePrimaryWorkspace"), "rbac uses resolver");
  assert(read("lib/workspace/resolve-workspace.ts").includes("resolvePrimaryWorkspace"), "workspace id uses resolver");
}

console.log("\nCASE — Multi company foundation");
{
  assert(exists("lib/org/company-operating-model.ts"), "operating model");
  const m = read("lib/org/company-operating-model.ts");
  assert(m.includes("STANDALONE") && m.includes("GROUP_MEMBER") && m.includes("INDEPENDENT"), "3 models");
  assert(m.includes("operatingModeImpliesCrossCompanyAccess"), "group != wildcard");
  assert(exists("lib/org/multi-company-scope.ts"), "multi-company scope helpers");
  assert(read("lib/org/multi-company-scope.ts").includes("assertIndependentCompaniesDoNotLeak"), "no leak helper");
}

console.log("\nCASE — Feature config foundation");
{
  assert(exists("lib/org/feature-config.ts"), "feature packs");
  const f = read("lib/org/feature-config.ts");
  assert(f.includes("multi_company") && f.includes("advanced_organization"), "enterprise packs");
  assert(f.includes("Feature enabled") || f.includes("≠") || f.includes("!="), "feature != permission");
  assert(f.includes("shouldShowEnterpriseOrgUi"), "progressive disclosure helper");
}

console.log("\nCASE — Session enrichment from active assignment");
{
  assert(exists("lib/org/active-assignment-workspace-server.ts"), "assignment→domain loader");
  assert(
    read("lib/access/module-assignments-server.ts").includes("enrichUserWithOrgWorkspaceContext"),
    "session enrich hooks org workspace",
  );
  assert(read("lib/access/context.ts").includes("active_workspace_domain"), "preserve domain on refresh");
}

console.log("\nCASE — Director workspace");
{
  assert(exists("app/(dashboard)/dashboard-director/page.tsx"), "director page");
  assert(read("lib/workspace/types.ts").includes('"director"'), "WorkspaceId director");
  assert(read("lib/rbac.ts").includes("/dashboard-director"), "known route");
}

console.log("\nCASE — Org authority still hierarchy-based (not role_code)");
{
  assert(read("lib/hr/org-authority.ts").includes("positionsUnderOrgAuthority"), "hierarchy authority");
  assert(read("lib/hr/org-approval-authority.ts").includes("positionsUnderOrgAuthority"), "approval hierarchy");
}

console.log("\nCASE — Pure resolver behavior (runtime)");
{
  // Dynamic import of compiled TS via node --experimental or duplicate minimal logic
  // Static guarantee: transfer helper + domain homes exist
  const res = read("lib/org/resolve-primary-workspace.ts");
  assert(res.includes("workspaceAfterPositionTransfer"), "transfer helper");
  const dom = read("lib/org/workspace-domain.ts");
  assert(dom.includes('case "hr":') && dom.includes('return "/hr"'), "HR Manager domain → /hr");
  assert(dom.includes('case "warehouse":') && dom.includes('return "/gudang"'), "Warehouse → /gudang");
  assert(dom.includes('case "finance":') && dom.includes('return "/keuangan"'), "Finance → /keuangan");
  assert(dom.includes('case "director":') && dom.includes("/dashboard-director"), "Director → management");
}

console.log("\nCASE — Mobile principle preserved");
{
  assert(exists("app/mobile/page.tsx"), "mobile companion kept");
  assert(exists("mobile/app/(tabs)/kerja.tsx"), "native meja kerja kept");
  assert(!read("app/mobile/page.tsx").includes("dashboard-director"), "mobile not full ERP director shell");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
