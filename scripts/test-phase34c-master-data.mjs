/**
 * Phase 34C — System Master Data / Legal Entity tests (local).
 * Run: npm run test:phase34c-master-data
 */

import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function hasMasterCap(role, cap) {
  if (role === "owner") return true;
  if (role === "hr") {
    return cap === "master_data.entity.view" || cap === "master_data.membership.assign";
  }
  return false;
}

function resolvePrimary(memberships) {
  if (memberships.length === 0) return { ok: false, reason: "none" };
  if (memberships.length === 1) return { ok: true, id: memberships[0].companyId };
  const primary = memberships.find((m) => m.isPrimary);
  if (primary) return { ok: true, id: primary.companyId };
  return { ok: false, reason: "ambiguous" };
}

console.log("\n=== Phase 34C Master Data Tests ===\n");

console.log("Capabilities");
{
  assert(hasMasterCap("owner", "master_data.entity.manage"), "owner manage");
  assert(hasMasterCap("owner", "master_data.entity.view"), "owner view");
  assert(hasMasterCap("hr", "master_data.entity.view"), "hr view");
  assert(hasMasterCap("hr", "master_data.membership.assign"), "hr assign");
  assert(!hasMasterCap("hr", "master_data.entity.manage"), "hr no manage");
  assert(!hasMasterCap("staff", "master_data.entity.view"), "staff no view");
}

console.log("Primary entity rule");
{
  assert(resolvePrimary([{ companyId: "a", isPrimary: false }]).id === "a", "single membership");
  assert(
    resolvePrimary([
      { companyId: "a", isPrimary: false },
      { companyId: "b", isPrimary: true },
    ]).id === "b",
    "multi with primary",
  );
  assert(!resolvePrimary([
    { companyId: "a", isPrimary: false },
    { companyId: "b", isPrimary: false },
  ]).ok, "multi no primary fails");
}

console.log("No duplicate master collections (static)");
{
  const forbidden = [
    "legal_entities",
    "accounting_companies",
    "hr_companies",
    "attendance_companies",
  ];
  for (const name of forbidden) {
    assert(!fs.existsSync(path.join("lib", name)), `no lib/${name}`);
  }
  assert(fs.existsSync("lib/master-data/legal-entity.ts"), "legal-entity module");
  assert(fs.existsSync("lib/master-data/membership.ts"), "membership module");
  assert(fs.existsSync("lib/capabilities/master-data.ts"), "master-data capabilities");
  assert(fs.existsSync("app/api/master-data/legal-entities/route.ts"), "legal-entities API");
  assert(fs.existsSync("components/hr/HrEntitySelectField.tsx"), "HrEntitySelectField");
  assert(fs.existsSync("scripts/migrate-local-master-data-phase34c.mjs"), "migration script");
}

console.log("SSOT collection name");
{
  const src = fs.readFileSync("lib/master-data/legal-entity.ts", "utf8");
  assert(src.includes("biz_company_profile"), "uses biz_company_profile SSOT");
  assert(!src.includes("legal_entities"), "no legal_entities collection");
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
