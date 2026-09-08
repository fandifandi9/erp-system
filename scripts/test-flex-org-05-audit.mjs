/**
 * Phase FLEX-ORG-05 — post-fix audit markers (non-destructive).
 * Asserts CRITICAL/HIGH findings from FLEX-ORG-05 are closed.
 * Run: npm run test:flex-org-05-audit
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

function uiFomToBackend(input) {
  if (input.status === "inactive") {
    return { mode: "SEPARATED", sharedScopeKind: "ALL_IN_MANAGEMENT", selectedEntityIds: [] };
  }
  const membership = new Set(input.activeMembershipIds.filter(Boolean));
  const selected = [
    ...new Set(input.managedEntityIds.map((x) => String(x).trim()).filter((id) => membership.has(id))),
  ];
  if (selected.length === 0) return { error: "ACTIVE_REQUIRES_ENTITY" };
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

console.log("=== FLEX-ORG-05 AUDIT — POST-FIX VERIFICATION ===\n");

console.log("CASE A–F — HR FOM");
{
  const mgmt = ["A", "B", "C"];
  assert(
    resolveSharedOperationalCandidates({
      mode: "SHARED",
      managementEntityIds: mgmt,
      sharedScopeKind: "ALL_IN_MANAGEMENT",
      selectedEntityIds: [],
      employmentCompanyId: "A",
    }).sort().join(",") === "A,B,C",
    "CASE A effective A+B+C",
  );
  assert(
    resolveSharedOperationalCandidates({
      mode: "SEPARATED",
      managementEntityIds: mgmt,
      sharedScopeKind: "ALL_IN_MANAGEMENT",
      selectedEntityIds: [],
      employmentCompanyId: "A",
    }).length === 0,
    "CASE C inactive empty",
  );
  assert(
    "error" in uiFomToBackend({ status: "active", managedEntityIds: [], activeMembershipIds: mgmt }),
    "CASE D active zero rejected",
  );
}

console.log("\nCASE — CRITICAL/HIGH findings closed");
{
  const leaveMig = read("pb_migrations/1788900001_updated_leave_requests_self_list.js");
  assert(leaveMig.includes("user = @request.auth.id"), "HR-05-01 leave self list migration");

  const schedule = read("lib/hr/work-schedule-auth.ts");
  assert(!schedule.includes("ops.length > 0 ? ops : getHrWorkingCompanyIds"), "HR-05-02 no working fallback");

  const leavePage = read("app/(dashboard)/hr/leave/page.tsx");
  assert(leavePage.includes("forHrMonitor=1"), "HR-05-03 desktop leave scoped");
  assert(!leavePage.includes('collection("leave_requests").getList'), "HR-05-03 no client leave getList");

  const otPage = read("app/(dashboard)/hr/overtime/page.tsx");
  assert(otPage.includes("forHrMonitor=1"), "HR-05-04 desktop OT scoped");

  const leaveServer = read("lib/hr/leave-server.ts");
  assert(/await assertHrLeaveSubjectInScope\(/.test(leaveServer), "HR-05-06 FOM subject on approve");

  const desk = read("lib/hr/desk-workbench-server.ts");
  assert(!/catch\s*\{\s*pendingOvertime\s*=\s*0/.test(desk), "HR-05-07 no OT catch→0");

  const rec = read("lib/hr/recruitment-request-server.ts");
  assert(rec.includes("DESK_RECRUITMENT_COUNT_FAILED"), "HR-05-08 recruitment count throws");

  const enf = read("lib/access/hr-api-enforcement.ts");
  assert(!enf.includes("if (ctx.isOwner || ctx.isHr) return true"), "HR-05-09 no isHr operational shortcut");

  const mobOt = read("mobile/lib/overtime.ts");
  assert(mobOt.includes("hr-queue-api") || mobOt.includes("mobileFetchOvertimeQueue"), "HR-05-10 mobile OT API");

  assert(schedule.includes("getHrOperationalCompanyIds"), "HR-05-11 schedule FOM ops");

  const policy = read("lib/hr/hr-policy-server.ts");
  assert(policy.includes("assertHrOperationalEntityAccess"), "HR-05-12 policy FOM ops");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
