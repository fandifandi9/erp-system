/**
 * Phase 35I-K-P1 — Foundation hardening targeted tests.
 * Run: npm run test:phase35i-k-p1-hardening
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log("  ✓", msg);
    passed += 1;
  } else {
    console.log("  ✗", msg);
    failed += 1;
  }
}

console.log("=== PHASE 35I-K-P1 FOUNDATION HARDENING ===\n");

console.log("CASE — One-active race/constraint");
{
  const asg = read("lib/hr/org-assignment-server.ts");
  assert(asg.includes("ORG_ASSIGNMENT_ONE_ACTIVE"), "one-active error code");
  assert(asg.includes("idx_hr_org_assign_one_active") || asg.includes("unique"), "unique constraint handling");
  assert(asg.includes("userActiveCount > 1"), "post-create race rollback");
  assert(exists("scripts/migrate-local-hr-phase35i-k-p1.mjs"), "local unique-index migration");
  const mig = read("scripts/migrate-local-hr-phase35i-k-p1.mjs");
  assert(mig.includes("WHERE") && mig.includes("is_active"), "partial unique index SQL");
  assert(mig.includes("serba.space") && mig.includes("BLOCKED"), "blocks production");
  assert(mig.includes("ABORT") || mig.includes("duplicate"), "aborts if duplicates exist");
}

console.log("\nCASE — Multi-holder endOrgAssignment + no stale cache authority");
{
  const asg = read("lib/hr/org-assignment-server.ts");
  assert(asg.includes("canAssignPositionHolder"), "end uses canAssignPositionHolder");
  assert(asg.includes("listActiveHoldersForPosition"), "loads all active holders");
  assert(asg.includes("holderUserIds"), "passes holderUserIds into authority graph");
  assert(
    !asg.includes("parentHolder?.userId || parent.holderUserId") &&
      !asg.includes("parentHolderId !== ctx.userId"),
    "removed first-holder/cache-only end gate",
  );
  assert(asg.includes("bukan cache holder") || asg.includes("canAssignPositionHolder"), "stale cache denied messaging");
}

console.log("\nCASE — Empty working → desk counts 0");
{
  const desk = read("lib/hr/desk-workbench-server.ts");
  assert(desk.includes("companyIds.length === 0"), "fail-closed when working empty");
  assert(desk.includes("pendingLeave: 0"), "leave → 0");
  assert(desk.includes("suspiciousAttendance: 0"), "attendance → 0");
  assert(desk.includes("openFindings: 0"), "findings → 0");
  assert(desk.includes("listUserIdsInCompanies") || desk.includes("userScopeFilter"), "leave scoped via subjects");
  assert(desk.includes("is_suspicious = true && (${scope})"), "attendance always scoped");
  assert(desk.includes("DESK_LEAVE_COUNT_FAILED"), "leave count errors surface");
  assert(!/filter:\s*`status = "pending"`/.test(desk), "no bare unscoped leave filter");
}

console.log("\nCASE — Entity scope no membership leak");
{
  const mc = read("app/api/hr/employees/manager-candidates/route.ts");
  assert(mc.includes("getHrEffectiveCompanyIds"), "manager-candidates uses effective");
  assert(!mc.includes("ctx.companyIds.length > 0") || mc.includes("getHrEffectiveCompanyIds"), "not raw membership default");
  const ws = read("lib/hr/work-schedule-server.ts");
  assert(ws.includes("getHrWorkingCompanyIds"), "schedule list uses working");
  assert(!ws.includes("ctx.companyIds.map"), "schedule list not membership map");
  const rep = read("lib/hr/reporting-server.ts");
  assert(rep.includes("getHrWorkingCompanyIds"), "reporting uses working");
  assert(!rep.includes("effective.length > 0 ? effective : ctx.companyIds"), "no membership fallback");
}

console.log("\nCASE — Recruitment queue hard-fail");
{
  const onboard = read("lib/hr/employee-onboarding-server.ts");
  assert(onboard.includes("RECRUITMENT_QUEUE_UNAVAILABLE"), "queue unavailable code");
  assert(!onboard.includes("still keep employee + pending flag"), "soft-fail comment removed");
  assert(onboard.includes("createPendingRecruitmentRequest"), "queue still created");
  assert(exists("lib/hr/recruitment-request-server.ts"), "approval workflow intact");
}

console.log("\nCASE — DB audit script");
{
  assert(exists("scripts/audit-local-hr-org-consistency.mjs"), "consistency audit script");
  const aud = read("scripts/audit-local-hr-org-consistency.mjs");
  assert(aud.includes("multi_active") || aud.includes("multi_active_users"), "detects A/F");
  assert(aud.includes("orphan"), "detects orphans");
  assert(aud.includes("stale") || aud.includes("holder_user"), "detects stale holder");
  assert(aud.includes("READ-ONLY") || aud.includes("read-only") || aud.includes("Does NOT mutate"), "read-only");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
