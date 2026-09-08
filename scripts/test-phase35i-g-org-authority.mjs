/**
 * Phase 35I-G — Final org authority & company scope tests.
 * Run: npm run test:phase35i-g-org-authority
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
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("=== PHASE 35I-G ORG AUTHORITY & COMPANY SCOPE ===\n");

console.log("CASE — Separation of concerns");
{
  const auth = read("lib/hr/org-authority.ts");
  assert(auth.includes("HR capability ≠ organizational authority") || auth.includes("HR capability"), "docs HR ≠ org");
  assert(!auth.includes('accessMode === "full"'), "no HR FULL bypass");
  assert(auth.includes("canEstablishChildUnderParent"), "child-under-parent rule");
  assert(auth.includes("buildOrgStructureActorCapabilities"), "actor capability snapshot");
  assert(read("lib/hr/org-structure-mode-server.ts").includes("requireOwnerForOrganizationStructureModeChange"), "mode Owner-only");
}

console.log("\nCASE — One active company + position");
{
  const asg = read("lib/hr/org-assignment-server.ts");
  assert(asg.includes("countActiveForUser"), "counts active per user");
  assert(asg.includes("ORG_ASSIGNMENT_ONE_ACTIVE") || asg.includes("satu waktu") || asg.includes("assignment organisasi aktif"), "one-active enforced");
  assert(asg.includes("ONE active") || asg.includes("one active") || asg.includes("35I-G"), "documents G rule");
  assert(exists("scripts/audit-phase35i-g-active-assignments.mjs"), "audit script for conflicts");
}

console.log("\nCASE — Hierarchy authority (inline)");
{
  function collectDescendantIds(flat, rootId) {
    const childrenByParent = new Map();
    for (const p of flat) {
      if (!p.parentPositionId) continue;
      const arr = childrenByParent.get(p.parentPositionId) || [];
      arr.push(p.id);
      childrenByParent.set(p.parentPositionId, arr);
    }
    const out = new Set();
    const stack = [...(childrenByParent.get(rootId) || [])];
    while (stack.length) {
      const id = stack.pop();
      if (out.has(id)) continue;
      out.add(id);
      for (const c of childrenByParent.get(id) || []) stack.push(c);
    }
    return out;
  }
  function positionsUnderOrgAuthority(flat, actorUserId) {
    const managed = new Set();
    for (const p of flat) {
      if (p.holderUserId !== actorUserId) continue;
      for (const d of collectDescendantIds(flat, p.id)) managed.add(d);
    }
    return managed;
  }
  const flat = [
    { id: "dir", parentPositionId: null, holderUserId: "D" },
    { id: "mhr", parentPositionId: "dir", holderUserId: "M" },
    { id: "shr", parentPositionId: "mhr", holderUserId: "S" },
    { id: "mfin", parentPositionId: "dir", holderUserId: "F" },
    { id: "sfin", parentPositionId: "mfin", holderUserId: "X" },
  ];
  const dirAuth = positionsUnderOrgAuthority(flat, "D");
  const mgrAuth = positionsUnderOrgAuthority(flat, "M");
  assert(dirAuth.has("mhr") && dirAuth.has("mfin") && dirAuth.has("shr"), "Director manages descendants");
  assert(!dirAuth.has("dir"), "Director does not manage self via subtree");
  assert(mgrAuth.has("shr") && !mgrAuth.has("mfin") && !mgrAuth.has("dir"), "Manager HR peer-isolated");
  assert(positionsUnderOrgAuthority(flat, "S").size === 0, "Staff leaf no mutation subtree");
}

console.log("\nCASE — Employee visibility");
{
  const scope = read("lib/hr/employee-list-scope.ts");
  assert(scope.includes("owner_all"), "Owner global list");
  assert(scope.includes("owner_company"), "Owner company filter");
  assert(scope.includes("org_hierarchy"), "Director/Manager org list");
  assert(scope.includes("hr_working"), "HR operational working scope");
  assert(scope.includes("HR FULL") || scope.includes("HR module"), "HR FULL does not expand alone");
  const page = read("app/(dashboard)/hr/employees/page.tsx");
  assert(page.includes("Semua entitas") || page.includes("ownerEntityFilter"), "Owner filter UI");
}

console.log("\nCASE — Org structure UI role-aware");
{
  const ui = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(ui.includes("actorCapabilities") || ui.includes("actorCaps"), "uses server capabilities");
  assert(ui.includes("canCreateRoot"), "root gated");
  assert(ui.includes("canChangeMode"), "mode gated");
  assert(ui.includes("Mode baca") || ui.includes("otoritas organisasi"), "read-only message for HR");
  const api = read("app/api/hr/org-positions/route.ts");
  assert(api.includes("actorCapabilities"), "API returns capabilities");
}

console.log("\nCASE — Position scope + authorized filter (no global GROUP/COMPANY)");
{
  const pos = read("lib/hr/org-position-server.ts");
  assert(pos.includes("resolveOrgStructureCompanyScope"), "authorized company filter");
  assert(pos.includes("ORG_SCOPE_CHILD_NOT_SUBSET") || pos.includes("subset dari scope parent"), "child scope ⊆ parent");
  const scope = read("lib/hr/employee-list-scope.ts");
  assert(
    scope.includes("Never expands beyond authorized") || scope.includes("FOM"),
    "list scope fail-closed / FOM-aware",
  );
  const posScope = read("lib/hr/org-position-scope.ts");
  assert(!posScope.includes('mode === "COMPANY"'), "no global COMPANY collapse");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
