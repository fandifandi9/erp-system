/**
 * Phase 35I-E — Harden organizational structure (authority + move + entity).
 * Run: npm run test:phase35i-e-org-structure
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

console.log("=== PHASE 35I-E ORG STRUCTURE HARDENING ===\n");

console.log("CASE — Authority model: HR FULL ≠ org authority");
{
  const auth = read("lib/hr/org-authority.ts");
  assert(auth.includes("positionsUnderOrgAuthority"), "subtree authority helper");
  assert(auth.includes("canEditPositionInSubtree"), "edit-in-subtree helper");
  assert(auth.includes("canMovePosition"), "move authority helper");
  assert(auth.includes("wouldCreateCycle"), "cycle helper");
  assert(!auth.includes("accessMode === \"full\""), "no HR FULL bypass in org-authority");
  assert(!/if \(ctx\.isHr\) return true/.test(auth), "no legacy isHr bypass");
  assert(auth.includes("canEstablishChildUnderParent"), "create-child helper");
  assert(auth.includes("canAssignPositionHolder"), "assign-holder helper");
}

console.log("\nCASE — Pure hierarchy rules (inline)");
{
  function collectDescendantIds(flat, rootId) {
    const childrenByParent = new Map();
    for (const p of flat) {
      if (!p.parentPositionId) continue;
      const arr = childrenByParent.get(p.parentPositionId) ?? [];
      arr.push(p.id);
      childrenByParent.set(p.parentPositionId, arr);
    }
    const out = new Set();
    const stack = [...(childrenByParent.get(rootId) ?? [])];
    while (stack.length) {
      const id = stack.pop();
      if (out.has(id)) continue;
      out.add(id);
      for (const c of childrenByParent.get(id) ?? []) stack.push(c);
    }
    return out;
  }
  function wouldCreateCycle(flat, positionId, newParentId) {
    if (!newParentId) return false;
    if (newParentId === positionId) return true;
    return collectDescendantIds(flat, positionId).has(newParentId);
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
    { id: "dir", parentPositionId: null, holderUserId: "u-dir" },
    { id: "mhr", parentPositionId: "dir", holderUserId: "u-mhr" },
    { id: "mfin", parentPositionId: "dir", holderUserId: "u-mfin" },
    { id: "shr", parentPositionId: "mhr", holderUserId: "u-shr" },
    { id: "sfin", parentPositionId: "mfin", holderUserId: null },
  ];

  const mhrManaged = positionsUnderOrgAuthority(flat, "u-mhr");
  assert(mhrManaged.has("shr"), "Manager HR manages Staff HR");
  assert(!mhrManaged.has("mfin"), "Manager HR cannot manage Manager Finance (peer)");
  assert(!mhrManaged.has("sfin"), "Manager HR cannot manage Staff Finance");
  assert(!mhrManaged.has("dir"), "Manager HR cannot manage Director");
  assert(!mhrManaged.has("mhr"), "holder does not manage self via subtree");

  const dirManaged = positionsUnderOrgAuthority(flat, "u-dir");
  assert(dirManaged.has("mhr") && dirManaged.has("mfin") && dirManaged.has("shr"), "Director manages subtree");

  assert(wouldCreateCycle(flat, "mhr", "shr"), "move to own descendant rejected");
  assert(wouldCreateCycle(flat, "mhr", "mhr"), "move to self rejected");
  assert(!wouldCreateCycle(flat, "shr", "mfin"), "move Staff HR under Manager Finance allowed graph-wise");

  // After move shr under mfin, subtree of mhr empty; mfin gains shr
  const afterMove = flat.map((p) => (p.id === "shr" ? { ...p, parentPositionId: "mfin" } : p));
  assert(positionsUnderOrgAuthority(afterMove, "u-mfin").has("shr"), "child subtree preserved under new parent");
  assert(!positionsUnderOrgAuthority(afterMove, "u-mhr").has("shr"), "old parent loses moved child");
}

console.log("\nCASE — Server: working entity + move + no HR admin surface bypass");
{
  const server = read("lib/hr/org-position-server.ts");
  assert(server.includes("getHrWorkingCompanyIds"), "list uses working entity helper");
  assert(server.includes("getHrEffectiveCompanyIds"), "authorized set preserved");
  assert(server.includes("serverMoveOrgPosition"), "move server fn");
  assert(server.includes("wouldCreateCycle"), "server cycle check");
  assert(server.includes("canEditPositionInSubtree"), "edit uses subtree authority");
  assert(server.includes("bukan HR capability"), "denial message separates HR cap");
  assert(!server.includes("assertHrAdminSurface"), "no HR FULL surface bypass for org mutations");
  assert(server.includes("approver unavailable"), "vacant parent → approver unavailable");
  assert(server.includes("masih ada jabatan bawahan"), "delete refuses children");
  assert(
    server.includes("purgeLinksForPosition") || server.includes("required relation"),
    "delete clears holder/assignment links",
  );
  assert(server.includes("Tidak dapat menetapkan pemegang pada jabatan nonaktif"), "inactive assign blocked");
}

console.log("\nCASE — API move action");
{
  const api = read("app/api/hr/org-positions/[id]/route.ts");
  assert(api.includes('action === "move"'), "PATCH action=move");
  assert(api.includes("serverMoveOrgPosition"), "routes to move server");
  assert(api.includes("approver=1"), "approver derive kept");
}

console.log("\nCASE — UI completeness");
{
  const page = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(page.includes("Tambah Jabatan Akar"), "root create label");
  assert(page.includes("Jabatan baru di bawah"), "child create under parent");
  assert(page.includes("Ubah jabatan"), "edit action");
  assert(page.includes("Pindah induk"), "move action");
  assert(page.includes("Tambah pemegang") || page.includes("Tetapkan pemegang") || page.includes("Ganti pemegang"), "holder action");
  assert(page.includes("Tambah bawahan"), "add child from detail");
  assert(page.includes("Hapus jabatan"), "delete action");
  assert(page.includes("childCount === 0") || page.includes("canDeletePosition && childCount"), "delete hidden when has children");
  assert(page.includes("isRoot") && page.includes("move"), "move hidden for root");
  assert(page.includes("Kosong") || page.includes("orang") || page.includes("Terisi"), "occupancy display");
  assert(page.includes("work-context"), "entity switch updates work context");
  assert(page.includes("PageShell"), "uses PageShell");
  assert(page.includes("Parent otomatis"), "parent not manual on + create");
}

console.log("\nCASE — Employee detail org-linked SSOT");
{
  const page = read("app/(dashboard)/hr/employees/[id]/page.tsx");
  const mut = read("lib/hr/employee-mutation-server.ts");
  assert(page.includes("SSOT dari Struktur Organisasi"), "org-linked jabatan read-only");
  assert(page.includes("Diturunkan dari jabatan induk"), "atasan derived read-only");
  assert(mut.includes("Tidak dapat mengubah jabatan organisasi milik sendiri"), "self position denied");
  assert(mut.includes("Tidak dapat mengubah atasan langsung milik sendiri"), "self superior denied");
  assert(mut.includes("Atasan langsung diturunkan dari jabatan organisasi"), "legacy manager blocked when org-linked");
  assert(mut.includes("canAssignPositionHolder"), "holder assign authority on link");
}

console.log("\nCASE — Privileged + list rules preserved");
{
  const mut = read("lib/hr/employee-mutation-server.ts");
  const authEmp = read("lib/hr/employee-auth.ts");
  const list = read("lib/hr/employee-list-server.ts");
  assert(
    mut.includes("Akun privileged hanya dapat dikelola oleh Owner") ||
      authEmp.includes("Akun privileged hanya dapat dikelola oleh Owner"),
    "privileged Owner-only",
  );
  assert(list.includes("isPrivilegedTargetUser") || list.includes("hidePrivilegedTargets"), "list privileged hide still present");
}

console.log("\nCASE — No new schema required (35I-D sufficient)");
{
  assert(exists("scripts/migrate-local-hr-phase35i-d.mjs"), "35I-D migration remains SSOT schema");
  assert(!exists("scripts/migrate-local-hr-phase35i-e.mjs"), "no 35I-E destructive/new schema migration");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
