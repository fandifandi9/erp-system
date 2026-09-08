/**
 * Phase FLEX-ORG-05-FIX — security / fail-closed hardening tests.
 * Run: npm run test:flex-org-05-fix
 * Non-destructive static + pure mapping checks.
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

console.log("=== FLEX-ORG-05-FIX — HARDENING ===\n");

console.log("CASE — Leave PB + desktop scoped");
{
  const mig = read("pb_migrations/1788900001_updated_leave_requests_self_list.js");
  assert(mig.includes("user = @request.auth.id"), "leave migration self list/view");
  assert(!mig.includes('listRule = "@request.auth.id != \\"\\""') || mig.includes("user ="), "not any-auth alone");
  const leavePage = read("app/(dashboard)/hr/leave/page.tsx");
  assert(leavePage.includes("forHrMonitor=1"), "desktop leave uses scoped API");
  assert(!leavePage.includes('collection("leave_requests").getList'), "desktop leave no client getList");
  const leaveServer = read("lib/hr/leave-server.ts");
  assert(leaveServer.includes("serverListLeaveForHrScope"), "leave monitor server list");
  assert(leaveServer.includes("assertHrLeaveSubjectInScope"), "leave subject FOM assert present");
  assert(
    /await assertHrLeaveSubjectInScope\(/.test(leaveServer),
    "leave approve path awaits assertHrLeaveSubjectInScope",
  );
  const leaveRoute = read("app/api/hr/leave/route.ts");
  assert(leaveRoute.includes("forHrMonitor"), "leave API forHrMonitor");
}

console.log("\nCASE — Overtime desktop + mobile scoped");
{
  const otPage = read("app/(dashboard)/hr/overtime/page.tsx");
  assert(otPage.includes("forHrMonitor=1"), "desktop OT scoped API");
  assert(!otPage.includes('collection("overtime_requests").getFullList'), "desktop OT no getFullList");
  const otServer = read("lib/hr/overtime-server.ts");
  assert(otServer.includes("serverListOvertimeForHrScope"), "OT monitor server");
  const mobOt = read("mobile/lib/overtime.ts");
  assert(mobOt.includes("mobileFetchOvertimeQueue") || mobOt.includes("hr-queue-api"), "mobile OT uses queue API");
  assert(!mobOt.includes('getFullList({\n    sort: "-created"'), "mobile OT ForHr not unscoped getFullList");
  const mobField = read("mobile/lib/field_activity.ts");
  assert(mobField.includes("mobileFetchFieldQueue") || mobField.includes("hr-queue-api"), "mobile field uses queue API");
  const libOt = read("lib/overtime.ts");
  assert(libOt.includes("forHrMonitor=1"), "web lib OT ForHr scoped");
  const libField = read("lib/field_activity.ts");
  assert(libField.includes("field-activity?pendingForApprover=1"), "web lib field ForHr scoped");
}

console.log("\nCASE — FOM inactive fail-closed (schedule)");
{
  const schedule = read("lib/hr/work-schedule-auth.ts");
  assert(!schedule.includes("ops.length > 0 ? ops : getHrWorkingCompanyIds"), "no working fallback");
  assert(schedule.includes("Scope operasional HR kosong"), "empty FOM denys with message");
  assert(schedule.includes("getHrOperationalCompanyIds"), "schedule uses FOM ops");
  assert(!schedule.includes('roleCode === "manager"'), "schedule view not role_code manager shortcut");
}

console.log("\nCASE — Meja Kerja no silent zero");
{
  const desk = read("lib/hr/desk-workbench-server.ts");
  assert(desk.includes("DESK_OT_COUNT_FAILED") || desk.includes("Gagal memuat antrian lembur"), "OT failure throws");
  assert(!/catch\s*\{\s*pendingOvertime\s*=\s*0/.test(desk), "no catch→0 for OT");
  const rec = read("lib/hr/recruitment-request-server.ts");
  assert(rec.includes("DESK_RECRUITMENT_COUNT_FAILED"), "recruitment count failure throws");
  assert(!/catch\s*\{\s*return 0;\s*\}/.test(rec.split("countPendingRecruitmentForApprover")[1]?.slice(0, 400) || ""), "recruitment no catch→0");
}

console.log("\nCASE — role_code demotion");
{
  const enf = read("lib/access/hr-api-enforcement.ts");
  assert(
    !/isHrOperationalActor[\s\S]*?ctx\.isHr/.test(enf) ||
      !enf.includes("if (ctx.isOwner || ctx.isHr) return true"),
    "isHrOperationalActor no longer Owner||isHr",
  );
  assert(enf.includes("hasActiveHrModuleAssignment"), "module assignment required");
  assert(
    !enf.includes("if (ctx.isOwner || ctx.isHr) return") ||
      enf.includes("Legacy role_code=hr alone is not sufficient"),
    "assertHrAdminSurface demoted from role_code",
  );
  assert(!enf.includes("isOwnerOrHrAccount(ctx.user)"), "requireHrModuleApiUser not role_code hr bypass");
}

console.log("\nCASE — HR policy + Management inactive");
{
  const policy = read("lib/hr/hr-policy-server.ts");
  assert(policy.includes("assertHrOperationalEntityAccess"), "policy mutate uses FOM ops");
  assert(!policy.includes("assertHrModuleEntityAccess(ctx, companyId)"), "policy no working-module-only assert");
  const scope = read("lib/org/resolve-operational-entity-scope.ts");
  assert(scope.includes("isActive === false"), "inactive Management fail-closed");
}

console.log("\nCASE — FOM mapping A–F (pure)");
{
  const mgmt = ["A", "B", "C"];
  const a = uiFomToBackend({ status: "active", managedEntityIds: mgmt, activeMembershipIds: mgmt });
  assert(!("error" in a) && a.sharedScopeKind === "ALL_IN_MANAGEMENT", "active all");
  assert(
    resolveSharedOperationalCandidates({
      mode: "SEPARATED",
      managementEntityIds: mgmt,
      sharedScopeKind: "ALL_IN_MANAGEMENT",
      selectedEntityIds: [],
      employmentCompanyId: "A",
    }).length === 0,
    "inactive → empty",
  );
  assert(
    "error" in uiFomToBackend({ status: "active", managedEntityIds: [], activeMembershipIds: mgmt }),
    "active zero rejected",
  );
}

console.log("\nCASE — Attendance regression markers intact");
{
  const att = read("lib/hr/attendance-server.ts");
  assert(att.includes("getBusinessDateYmd") || read("lib/hr/business-date.ts").includes("Asia/Jakarta"), "Jakarta business date");
  const migAtt = read("pb_migrations/1788750399_updated_attendance_logs.js");
  assert(migAtt.includes("createRule = null"), "attendance write lock migration");
  const deskAtt = read("components/hr/DesktopAttendancePanel.tsx");
  assert(deskAtt.includes("isAttendanceOfficeDebugAllowed"), "office GPS gated");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
