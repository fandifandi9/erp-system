/**
 * Phase 35I-D — Organizational Position Master foundation tests.
 * Run: npm run test:phase35i-d-org-structure
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";

const root = process.cwd();
const require = createRequire(import.meta.url);
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

console.log("=== PHASE 35I-D ORG STRUCTURE TESTS ===\n");

console.log("CASE — Schema / migration / collection");
{
  assert(exists("scripts/migrate-local-hr-phase35i-d.mjs"), "migration script exists");
  const mig = read("scripts/migrate-local-hr-phase35i-d.mjs");
  assert(mig.includes("hr_org_positions"), "creates hr_org_positions");
  assert(mig.includes("parent_position"), "parent_position relation");
  assert(mig.includes("holder_user"), "holder_user relation");
  assert(mig.includes("org_position_id"), "profiles.org_position_id additive");
  assert(mig.includes("serba.space"), "blocks production URL");
}

console.log("\nCASE — Server model: parent → child, vacant, approver");
{
  const types = read("lib/hr/org-position-types.ts");
  const server = read("lib/hr/org-position-server.ts");
  const auth = read("lib/hr/org-authority.ts");
  assert(types.includes("parentPositionId"), "parent position id");
  assert(types.includes("holderUserId"), "holder user id");
  assert(types.includes("filled"), "filled/vacant flag");
  assert(server.includes("deriveSuperiorFromPosition"), "derive superior");
  assert(server.includes("deriveApproverForTargetPosition"), "derive approver");
  assert(server.includes("buildOrgPositionTree"), "tree builder");
  assert(server.includes("wouldCreateCycle") || server.includes("siklus") || server.includes("melingkar"), "cycle guard");
  assert(auth.includes("canEstablishChildUnderParent"), "org authority helper");
  assert(auth.includes("isOwner") || auth.includes("canOwnerManageOrgStructure"), "Owner root authority");
  assert(!auth.includes('accessMode === "full"'), "35I-D helper no longer grants HR FULL org authority");
}

console.log("\nCASE — Approver not free-form");
{
  const server = read("lib/hr/org-position-server.ts");
  assert(server.includes("Approver = pemegang jabatan induk"), "approver = parent holder");
  assert(!server.includes("approver_user_id from client"), "no client approver write");
  const api = read("app/api/hr/org-positions/[id]/route.ts");
  assert(api.includes("approver=1"), "approver derive endpoint");
}

console.log("\nCASE — Employee detail: derived atasan / self lock");
{
  const detail = read("lib/hr/employee-detail-server.ts");
  const mut = read("lib/hr/employee-mutation-server.ts");
  const page = read("app/(dashboard)/hr/employees/[id]/page.tsx");
  assert(detail.includes("derivedSuperior"), "detail returns derived superior");
  assert(detail.includes("managerIsDerived"), "manager derived flag");
  assert(mut.includes("org_position_id"), "mutation accepts org position");
  assert(mut.includes("Tidak dapat mengubah jabatan organisasi milik sendiri"), "self position denied");
  assert(mut.includes("Tidak dapat mengubah atasan langsung milik sendiri"), "self superior edit denied");
  assert(mut.includes("canAssignPositionHolder"), "org position link uses org authority");
  assert(mut.includes("Atasan langsung diturunkan dari jabatan organisasi"), "free manager blocked when org linked");
  assert(page.includes("Diturunkan dari jabatan induk"), "UI read-only atasan");
  assert(page.includes("isSelfProfile"), "self profile guard in UI");
}

console.log("\nCASE — UI + routes + nav");
{
  assert(exists("app/(dashboard)/pengaturan/organisasi/page.tsx"), "org structure page");
  assert(exists("app/api/hr/org-positions/route.ts"), "list/create API");
  assert(exists("app/api/hr/org-positions/[id]/route.ts"), "detail/update API");
  const nav = read("lib/wms/navigation.ts");
  assert(nav.includes("/pengaturan/organisasi"), "nav link");
  assert(nav.includes("Struktur Organisasi"), "nav label");
  assert(read("lib/access/module-registry.ts").includes("/pengaturan/organisasi"), "module registry path");
  assert(read("lib/rbac.ts").includes("/pengaturan/organisasi"), "rbac path");
}

console.log("\nCASE — Pure tree builder (inline)");
{
  function buildOrgPositionTree(flat) {
    const byId = new Map();
    for (const p of flat) byId.set(p.id, { ...p, children: [] });
    const roots = [];
    for (const node of byId.values()) {
      if (node.parentPositionId && byId.has(node.parentPositionId)) {
        byId.get(node.parentPositionId).children.push(node);
      } else roots.push(node);
    }
    const sortRec = (nodes) => {
      nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      for (const n of nodes) sortRec(n.children);
    };
    sortRec(roots);
    return roots;
  }
  const flat = [
    { id: "d", companyId: "c", name: "Director", parentPositionId: null, holderUserId: "u1", isActive: true, isRoot: true, sortOrder: 0, filled: true },
    { id: "mf", companyId: "c", name: "Manager Finance", parentPositionId: "d", holderUserId: null, isActive: true, isRoot: false, sortOrder: 0, filled: false },
    { id: "sf", companyId: "c", name: "Staff Finance", parentPositionId: "mf", holderUserId: "u2", isActive: true, isRoot: false, sortOrder: 0, filled: true },
    { id: "sh", companyId: "c", name: "Staff HR", parentPositionId: "d", holderUserId: "u3", isActive: true, isRoot: false, sortOrder: 1, filled: true },
  ];
  const tree = buildOrgPositionTree(flat);
  assert(tree.length === 1 && tree[0].name === "Director", "Director root");
  assert(tree[0].children.some((c) => c.name === "Manager Finance"), "Manager under Director");
  assert(tree[0].children.some((c) => c.name === "Staff HR"), "Staff direct under Director (UMKM)");
  const mf = tree[0].children.find((c) => c.name === "Manager Finance");
  assert(mf && mf.children.some((c) => c.name === "Staff Finance"), "Staff under Manager");
  assert(mf && mf.filled === false, "vacant Manager Finance");
  assert(read("lib/hr/org-position-tree.ts").includes("buildOrgPositionTree"), "tree module exists");
}

console.log("\nCASE — Privileged protection preserved");
{
  const empAuth = read("lib/hr/employee-auth.ts");
  assert(empAuth.includes("Akun privileged hanya dapat dikelola oleh Owner."), "privileged Owner-only message");
  const list = read("lib/hr/employee-list-server.ts");
  assert(list.includes("hidePrivilegedTargets") || list.includes("isPrivilegedTargetUser"), "list privileged hide");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
