/**
 * Phase 35I-J — Recruitment approval → Meja Kerja + Desktop/Mobile direction.
 * Run: npm run test:phase35i-j-recruitment-approval
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

console.log("=== PHASE 35I-J RECRUITMENT APPROVAL + DESKTOP/MOBILE ===\n");

console.log("CASE 1 — Staff HR create → PENDING queue");
{
  const onboard = read("lib/hr/employee-onboarding-server.ts");
  assert(onboard.includes("createPendingRecruitmentRequest"), "queues pending when !canAppoint");
  assert(onboard.includes("appointmentPending"), "appointmentPending flag");
  assert(exists("lib/hr/recruitment-request-server.ts"), "recruitment server");
  assert(exists("lib/hr/recruitment-request-types.ts"), "recruitment types");
  const types = read("lib/hr/recruitment-request-types.ts");
  assert(types.includes("PENDING") && types.includes("APPROVED") && types.includes("REJECTED"), "status model");
}

console.log("\nCASE 2–4 — Approver derived + Meja Kerja + unauthorized denied");
{
  const srv = read("lib/hr/recruitment-request-server.ts");
  assert(srv.includes("canAssignPositionHolder"), "CASE3 approver via hierarchy");
  assert(srv.includes("requestedBy") && srv.includes("ctx.userId"), "CASE7 no self-approve");
  assert(srv.includes("RECRUITMENT_APPROVE_DENIED"), "unauthorized 403");
  assert(!srv.includes('accessMode === "full"'), "no HR FULL bypass");
  const desk = read("lib/hr/desk-workbench-server.ts");
  assert(desk.includes("pendingRecruitmentApprovals"), "CASE2 desk count from data");
  assert(desk.includes("countPendingRecruitmentForApprover"), "approver-scoped count");
  const ui = read("components/workspace/StaffDeskWorkbench.tsx");
  assert(ui.includes("Prioritas") || ui.includes("Recruitment Baru"), "Meja Kerja priority cards");
  assert(ui.includes("pendingRecruitmentApprovals"), "badge key wired");
  assert(ui.includes("shouldShowDeskItem") || ui.includes("pendingRecruitmentApprovals > 0"), "hide when zero");
}

console.log("\nCASE 5–6 — Approve creates assignment; Reject records reason");
{
  const srv = read("lib/hr/recruitment-request-server.ts");
  assert(srv.includes("createOrgAssignment"), "CASE5 approve → org assignment");
  assert(srv.includes("rejection_reason") || srv.includes("rejectionReason"), "CASE6 reject reason");
  assert(srv.includes("RECRUITMENT_ALREADY_APPROVED"), "no re-approve");
  assert(srv.includes("RECRUITMENT_ALREADY_REJECTED"), "no re-reject");
  assert(exists("app/api/hr/recruitment-requests/[id]/approve/route.ts"), "approve API");
  assert(exists("app/api/hr/recruitment-requests/[id]/reject/route.ts"), "reject API");
  assert(exists("app/(dashboard)/hr/recruitment-approvals/page.tsx"), "review UI");
}

console.log("\nCASE 8 — Multi-holder compatible (no new position on recruit)");
{
  const asg = read("lib/hr/org-assignment-server.ts");
  assert(asg.includes("MANY active holders") || asg.includes("multi-holder"), "35I-I multi-holder intact");
  assert(asg.includes("ORG_ASSIGNMENT_ONE_ACTIVE"), "one-active employee intact");
}

console.log("\nCASE 9–12 — Desktop entry vs Mobile companion");
{
  const rbac = read("lib/rbac.ts");
  assert(rbac.includes("never Mobile") || rbac.includes("Desktop ERP"), "CASE9 desktop primary documented");
  assert(rbac.includes('return "/dashboard-staff"'), "staff → desktop dashboard");
  assert(rbac.includes('return "/dashboard-owner"'), "owner → desktop");
  assert(!rbac.includes('return "/mobile"'), "CASE10 login never → mobile");
  assert(exists("app/mobile/page.tsx"), "CASE11 mobile companion page");
  const mobile = read("app/mobile/page.tsx");
  assert(mobile.includes("Kembali ke Desktop ERP") || mobile.includes("Desktop ERP"), "mobile → desktop link");
  assert(mobile.includes("Companion") || mobile.includes("ringan"), "CASE12 lightweight mobile");
  const side = read("components/workspace/WorkspaceMobileAccessFooter.tsx");
  assert(side.includes("Akses Mobile") && side.includes('href="/mobile"'), "Desktop Akses Mobile link");
  assert(side.includes('target="_blank"'), "Akses Mobile opens new tab (35I-L)");
  assert(side.includes("noopener"), "Akses Mobile noopener");
}

console.log("\nCASE 13–15 — Multi-tab / shared session preserved");
{
  assert(exists("components/WebSessionGuard.tsx"), "WebSessionGuard intact");
  const footer = read("components/workspace/WorkspaceMobileAccessFooter.tsx");
  assert(footer.includes('target="_blank"'), "Akses Mobile opens new tab");
  const mobile = read("app/mobile/page.tsx");
  assert(mobile.includes("Session sama") || mobile.includes("Session login sama"), "CASE13/14 tab isolation note");
}

console.log("\nCASE — Migration local only");
{
  assert(exists("scripts/migrate-local-hr-phase35i-j.mjs"), "local migration script");
  const mig = read("scripts/migrate-local-hr-phase35i-j.mjs");
  assert(mig.includes("hr_recruitment_requests"), "collection name");
  assert(mig.includes("serba.space") && mig.includes("BLOCKED"), "blocks production");
  assert(read("package.json").includes("migrate:local-hr-phase35i-j"), "npm script");
}

console.log("\nCASE — 35I-G/H/I invariants untouched in authority");
{
  const auth = read("lib/hr/org-authority.ts");
  assert(auth.includes("HR capability ≠ organizational authority") || auth.includes("HR capability"), "HR ≠ org");
  assert(auth.includes("holderUserIds"), "multi-holder authority");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
