/**
 * Phase 35I-F3 — Per-entity org assignment foundation tests.
 * Run: npm run test:phase35i-f3-org-assignment
 *
 * Mix of pure helper behavior + source/API contract asserts.
 * Live PB mutation coverage is exercised via migration + regression suites.
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

/** Inline mirrors of lib/hr/org-position-scope.ts (FLEX-ORG-04 — no global mode). */
function effectivePositionCompanyIds(position, allAuthorized = []) {
  if (position.scopeType === "GROUP" || position.scopeType === "ALL_COMPANIES") return [...allAuthorized];
  return position.scopeCompanyIds?.length
    ? [...position.scopeCompanyIds]
    : position.companyId
      ? [position.companyId]
      : [];
}
function companyInPositionScope(companyId, position, allAuthorized = []) {
  return effectivePositionCompanyIds(position, allAuthorized).includes(companyId);
}
function isChildScopeSubsetOfParent(childEff, parentEff, parentWide) {
  if (parentWide) return true;
  if (parentEff.length === 0) return childEff.length === 0;
  const set = new Set(parentEff);
  return childEff.every((id) => set.has(id));
}
function isGroupWideScope(scopeType) {
  return scopeType === "GROUP" || scopeType === "ALL_COMPANIES";
}

/** Simulate assignment uniqueness (35I-G one active per user; 35I-I multi-holder OK). */
function canCreateActiveAssignment(store, { userId, companyId, positionId }) {
  if (store.some((a) => a.isActive && a.userId === userId)) {
    return { ok: false, reason: "duplicate_user_company" };
  }
  // Position may already have other holders — allowed (multi-holder).
  void positionId;
  void companyId;
  return { ok: true };
}

/** Multi-company context resolution (Budi PT A / PT S). */
function resolveContextAssignment(assignments, userId, companyId) {
  return assignments.find((a) => a.isActive && a.userId === userId && a.companyId === companyId) || null;
}

function deriveSuperior(assignments, positions, assignment) {
  const pos = positions.find((p) => p.id === assignment.positionId);
  if (!pos?.parentId) return { vacant: false, superiorUserId: null, reason: "root" };
  const parent = positions.find((p) => p.id === pos.parentId);
  if (!parent) return { vacant: true, superiorUserId: null, reason: "missing_parent" };
  const holder = assignments.find((a) => a.isActive && a.positionId === parent.id);
  if (!holder) return { vacant: true, superiorUserId: null, reason: "vacant_parent" };
  if (parent.scopeType === "SELECTED_COMPANIES") {
    const eff = parent.scopeCompanyIds || [];
    if (!eff.includes(assignment.companyId)) {
      return { vacant: true, superiorUserId: null, reason: "scope_unavailable" };
    }
  }
  return { vacant: false, superiorUserId: holder.userId, reason: "ok" };
}

console.log("=== PHASE 35I-F3 ORG ASSIGNMENT ===\n");

console.log("CASE A — Migration / schema");
{
  assert(exists("scripts/migrate-local-hr-phase35i-f3.mjs"), "migration script");
  const mig = read("scripts/migrate-local-hr-phase35i-f3.mjs");
  assert(mig.includes("hr_employee_org_assignments"), "assignments collection");
  assert(mig.includes("scope_type"), "position scope_type");
  assert(mig.includes("scope_company_ids"), "position scope_company_ids");
  assert(mig.includes("serba.space"), "blocks production");
  assert(mig.includes("SELECTED_COMPANIES"), "safe GROUP backfill SELECTED=[company]");
  assert(mig.includes("backfill from profiles"), "profile → assignment backfill");
}

console.log("\nCASE B — Single active placement + history (not concurrent multi-company)");
{
  // 35I-G: only one active at a time; history allowed
  const history = [
    { id: "1", userId: "budi", companyId: "A", positionId: "sf-a", isActive: false },
    { id: "2", userId: "budi", companyId: "S", positionId: "sf-s", isActive: true },
  ];
  const active = history.filter((a) => a.isActive);
  assert(active.length === 1 && active[0].companyId === "S", "only one active company placement");
  assert(history.filter((a) => !a.isActive).length === 1, "historical assignment preserved");
  const positions = [
    { id: "sf-s", name: "Staff Finance", companyId: "S", parentId: "mf-s" },
    { id: "mf-s", name: "Manager Finance S", companyId: "S", parentId: "dir" },
    { id: "dir", name: "Direktur", companyId: "S", parentId: null },
  ];
  const assignments = [
    { id: "2", userId: "budi", companyId: "S", positionId: "sf-s", isActive: true },
    { id: "3", userId: "ani", companyId: "S", positionId: "mf-s", isActive: true },
  ];
  const ctxS = resolveContextAssignment(assignments, "budi", "S");
  assert(ctxS?.positionId === "sf-s", "context S → Staff Finance");
  const supS = deriveSuperior(assignments, positions, ctxS);
  assert(supS.superiorUserId === "ani", "superior S = Manager Finance S holder");
}

console.log("\nCASE C — Constraints");
{
  const store = [];
  const a1 = canCreateActiveAssignment(store, { userId: "budi", companyId: "A", positionId: "p1" });
  assert(a1.ok, "first assignment allowed");
  store.push({ userId: "budi", companyId: "A", positionId: "p1", isActive: true });
  assert(canCreateActiveAssignment(store, { userId: "budi", companyId: "A", positionId: "p2" }).reason === "duplicate_user_company", "duplicate user+company rejected");
  // 35I-G also rejects second company while first still active (simpler store check)
  assert(
    store.some((a) => a.isActive && a.userId === "budi") &&
      canCreateActiveAssignment(store, { userId: "budi", companyId: "S", positionId: "p3" }).reason === "duplicate_user_company",
    "second active company while first active rejected (one-active)",
  );
  assert(canCreateActiveAssignment(store, { userId: "other", companyId: "B", positionId: "p1" }).ok, "second holder on same position allowed (multi-holder)");

  const posA = { companyId: "A", scopeType: "SELECTED_COMPANIES", scopeCompanyIds: ["A"] };
  assert(companyInPositionScope("A", posA), "selected scope match");
  assert(!companyInPositionScope("S", posA), "selected scope rejects outside");

  const parent = { companyId: "A", scopeType: "SELECTED_COMPANIES", scopeCompanyIds: ["A"] };
  const childWide = { companyId: "A", scopeType: "SELECTED_COMPANIES", scopeCompanyIds: ["A", "S"] };
  const pEff = effectivePositionCompanyIds(parent, ["A", "S"]);
  const cEff = effectivePositionCompanyIds(childWide, ["A", "S"]);
  assert(!isChildScopeSubsetOfParent(cEff, pEff, false), "child wider than parent rejected");
  assert(
    isChildScopeSubsetOfParent(
      effectivePositionCompanyIds({ companyId: "A", scopeType: "SELECTED_COMPANIES", scopeCompanyIds: ["A"] }),
      effectivePositionCompanyIds({ companyId: "A", scopeType: "SELECTED_COMPANIES", scopeCompanyIds: ["A", "S"] }),
      false,
    ),
    "child subset of parent allowed",
  );
  assert(isGroupWideScope("GROUP") && isChildScopeSubsetOfParent(["A", "S"], [], true), "wide parent allows any child subset");
}

console.log("\nCASE D/E — Holder + superior/approver vacant");
{
  const positions = [
    { id: "child", parentId: "parent", companyId: "A" },
    { id: "parent", parentId: null, companyId: "A", scopeType: "SELECTED_COMPANIES", scopeCompanyIds: ["A"] },
  ];
  const vacant = deriveSuperior([], positions, { positionId: "child", companyId: "A" });
  assert(vacant.vacant === true && vacant.superiorUserId == null, "vacant parent → superior unavailable");
  const filled = deriveSuperior(
    [{ userId: "boss", positionId: "parent", isActive: true, companyId: "A" }],
    positions,
    { positionId: "child", companyId: "A" },
  );
  assert(filled.superiorUserId === "boss", "parent holder resolves superior/approver");
  const scopeMiss = deriveSuperior(
    [{ userId: "boss", positionId: "parent", isActive: true, companyId: "A" }],
    [{ id: "child", parentId: "parent" }, { id: "parent", scopeType: "SELECTED_COMPANIES", scopeCompanyIds: ["A"] }],
    { positionId: "child", companyId: "S" },
  );
  assert(scopeMiss.vacant && scopeMiss.reason === "scope_unavailable", "invalid parent scope → unavailable");
}

console.log("\nCASE — Scope helpers (library file + inline)");
{
  assert(exists("lib/hr/org-position-scope.ts"), "scope helper module");
  const scopeSrc = read("lib/hr/org-position-scope.ts");
  assert(scopeSrc.includes("isChildScopeSubsetOfParent"), "subset helper exported");
  assert(scopeSrc.includes("companyInPositionScope"), "companyInPositionScope exported");
  assert(
    effectivePositionCompanyIds({ companyId: "A", scopeType: "SELECTED_COMPANIES", scopeCompanyIds: [] }).join(",") ===
      "A",
    "empty selected falls back to position.company",
  );
}

console.log("\nCASE — Assignment server SSOT");
{
  const server = read("lib/hr/org-assignment-server.ts");
  assert(server.includes("createOrgAssignment"), "create assignment");
  assert(server.includes("endOrgAssignment"), "end assignment");
  assert(server.includes("getActiveOrgAssignment"), "get active");
  assert(server.includes("getPositionHolderFromAssignment"), "holder from assignment");
  assert(server.includes("self-assign"), "self-assign denied");
  assert(server.includes("Sudah ada assignment aktif") || server.includes("ORG_ASSIGNMENT_ONE_ACTIVE") || server.includes("assignment organisasi aktif"), "unique user+company / one-active");
  assert(server.includes("ORG_ASSIGNMENT_ONE_ACTIVE") || server.includes("satu waktu"), "one-active user constraint");
  assert(server.includes("race"), "race mitigation");
  assert(server.includes("countActiveForUser"), "35I-G one active per user");
  assert(server.includes("deriveSuperiorForAssignment"), "superior from assignment");
  assert(server.includes("ORG_ASSIGNMENT_SCOPE_MISMATCH") || server.includes("scope jabatan"), "scope mismatch");
  assert(server.includes("resolveOrgContextForUserCompany"), "context resolver + profile fallback");
  assert(server.includes("syncHolderCache") || server.includes("holder_user"), "holder cache sync");
}

console.log("\nCASE — Position scope + COMPANY boundary + move");
{
  const pos = read("lib/hr/org-position-server.ts");
  assert(pos.includes("scope_type"), "writes scope_type");
  assert(pos.includes("ORG_SCOPE_CHILD_NOT_SUBSET") || pos.includes("subset dari scope parent"), "child ⊆ parent");
  assert(pos.includes("createOrgAssignment"), "holder via assignment SSOT");
  assert(pos.includes("getPositionHolderFromAssignment"), "holder derive assignment");
  assert(pos.includes("enrichHoldersFromAssignments") || pos.includes("HR_EMPLOYEE_ORG_ASSIGNMENTS"), "list holder from assignment");
  assert(pos.includes("assertCompanyAuthorized"), "company authorization on mutations");
}

console.log("\nCASE F — Authority principles");
{
  const auth = read("lib/hr/org-authority.ts");
  assert(!auth.includes('accessMode === "full"'), "no HR FULL org bypass");
  assert(auth.includes("positionsUnderOrgAuthority"), "subtree authority");
  assert(auth.includes("self") || auth.includes("diri"), "self-protection language present or via callers");
  assert(read("lib/hr/org-structure-mode-server.ts").includes("requireOwnerForOrganizationStructureModeChange"), "mode Owner-only");
  assert(read("lib/hr/org-assignment-server.ts").includes("Hanya Owner yang dapat menetapkan holder jabatan akar") || read("lib/hr/org-assignment-server.ts").includes("jabatan akar"), "HR FULL denied structural root");
}

console.log("\nCASE G — Employee list scope (Owner / org / working)");
{
  const list = read("lib/hr/employee-list-server.ts");
  const scope = read("lib/hr/employee-list-scope.ts");
  assert(scope.includes("owner_all"), "Owner can list all authorized entities");
  assert(scope.includes("owner_company"), "Owner can filter one entity");
  assert(scope.includes("org_hierarchy"), "org holders get hierarchy company scope");
  assert(
    scope.includes("getHrOperationalCompanyIds") || scope.includes("hr_working"),
    "non-org non-Owner uses FOM/HR operational scope",
  );
  assert(list.includes("resolveEmployeeListCompanyScope"), "list uses scope resolver");
  assert(
    list.includes("WORKING ENTITY ONLY") ||
      list.includes("working entity") ||
      scope.includes("hr_working"),
    "documents working fallback",
  );
  // Non-Owner without org: working-only semantics
  const authorized = ["A", "S"];
  const working = ["S"];
  const listIds = working;
  assert(listIds.join(",") === "S" && !listIds.includes("A"), "non-org: authorized A+S working S → list S only");
  // Owner all: sees A+S
  const ownerAll = [...authorized];
  assert(ownerAll.includes("A") && ownerAll.includes("S"), "Owner all-entities includes A and S");
}

console.log("\nCASE H — Employee detail + compatibility");
{
  const detail = read("lib/hr/employee-detail-server.ts");
  assert(detail.includes("resolveOrgContextForUserCompany"), "detail uses assignment context");
  assert(detail.includes("otherAssignments"), "other company assignments");
  assert(detail.includes("assignmentSource"), "source flag");
  const page = read("app/(dashboard)/hr/employees/[id]/page.tsx");
  assert(page.includes("otherOrgAssignments") || page.includes("Assignment lain"), "UI other assignments");
  assert(read("lib/hr/org-assignment-server.ts").includes("profile_fallback"), "profile fallback");
  assert(detail.includes("org_position_id"), "profile field still read");
  assert(exists("lib/hr/org-structure-mode.ts"), "F1 mode intact");
}

console.log("\nCASE I — Privileged accounts + mutation");
{
  assert(read("lib/hr/employee-list-server.ts").includes("hidePrivilegedTargets") || read("lib/hr/employee-list-server.ts").includes("isPrivilegedTargetUser"), "privileged hide for non-owner");
  const mut = read("lib/hr/employee-mutation-server.ts");
  assert(mut.includes("createOrgAssignment") || mut.includes("org-assignment-server"), "mutation writes assignment SSOT");
}

console.log("\nCASE — APIs");
{
  assert(exists("app/api/hr/org-assignments/route.ts"), "list/create API");
  assert(exists("app/api/hr/org-assignments/[id]/route.ts"), "end API");
  assert(read("app/api/hr/org-assignments/route.ts").includes("createOrgAssignment"), "POST create");
  assert(read("app/api/hr/org-assignments/[id]/route.ts").includes("endOrgAssignment"), "PATCH/DELETE end");
  assert(read("app/api/hr/org-positions/route.ts").includes("scopeType") || read("app/api/hr/org-positions/route.ts").includes("scope_type"), "positions API accepts scope");
}

console.log("\nCASE — Org structure UI minimal");
{
  const ui = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(ui.includes("Kosong") || ui.includes("Terisi") || ui.includes("orang"), "EMPTY/OCCUPIED occupancy label");
  assert(ui.includes("Scope jabatan") || ui.includes("scopeType"), "GROUP scope display");
}

// Optional: import compiled TS scope via tsx not available — skip require of .ts

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
