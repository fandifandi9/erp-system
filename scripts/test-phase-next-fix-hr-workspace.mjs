/**
 * Phase NEXT-FIX — True HR Full Desktop Workspace.
 * Run: npm run test:phase-next-fix-hr-workspace
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
    console.log("  ✓", msg);
  } else {
    failed++;
    console.log("  ✗", msg);
  }
}

console.log("=== PHASE NEXT-FIX — TRUE HR FULL DESKTOP WORKSPACE ===\n");

console.log("CASE — Landing / authorization SSOT");
{
  const rbac = read("lib/rbac.ts");
  assert(rbac.includes("hasHrFullWorkspaceAccess"), "hasHrFullWorkspaceAccess exported");
  assert(rbac.includes("userHasHrWorkspaceLanding") || rbac.includes("module_web_paths includes /hr"), "hub landing helper");
  assert(rbac.includes("resolvePrimaryWorkspace") || rbac.includes("/hr"), "HR hub → /hr");
  assert(!/return\s+"\/mobile"/.test(rbac), "login never mobile");
  const mid = read("middleware.ts");
  assert(mid.includes("resolveMiddlewareAuthUserForLanding"), "landing enrich");
  assert(mid.includes('pathname === "/dashboard-staff"'), "staff home redirect gate");
  assert(mid.includes("hasHrFullWorkspaceAccess"), "HR Full redirect uses SSOT");
  assert(read("lib/access/middleware-access-user.ts").includes("resolveMiddlewareAuthUserForLanding"), "landing enrich helper");
}

console.log("\nCASE — HR Full does not use Staff shell");
{
  const side = read("components/Sidebar.tsx");
  assert(side.includes("HrSidebarNav"), "Sidebar uses HrSidebarNav");
  assert(side.includes("useHrSidebarNav"), "HR shell flag");
  assert(!side.includes("isHrOperationalPath"), "no Staff+HR path-flip hybrid");
  const staffView = read("components/workspace/StaffWorkspaceView.tsx");
  assert(staffView.includes("hasHrFullWorkspaceAccess"), "Staff home redirects HR Full");
  assert(staffView.includes('router.replace("/hr")'), "redirect to /hr");
  assert(!staffView.includes("StaffRoleWorkspaceStrip"), "no HR strip on Staff home");
}

console.log("\nCASE — True HR workspace nav IA");
{
  assert(exists("components/workspace/HrSidebarNav.tsx"), "HrSidebarNav component");
  assert(exists("lib/workspace/workspaces/hr.ts"), "hr workspace config");
  const hrNav = read("components/workspace/HrSidebarNav.tsx");
  assert(
    hrNav.includes("workspace.hr.dashboard.title") || hrNav.includes("HR / SDM"),
    "HR brand label",
  );
  assert(hrNav.includes("StaffDeskWorkbench"), "Meja Kerja in HR shell");
  assert(
    read("components/workspace/WorkspaceMobileAccessFooter.tsx").includes('href="/mobile"') &&
      read("components/workspace/WorkspaceMobileAccessFooter.tsx").includes('target="_blank"'),
    "Akses Mobile new tab",
  );
  assert(!hrNav.includes("personalSection"), "Personal not primary in HR sidebar");
  const hrCfg = read("lib/workspace/workspaces/hr.ts");
  assert(hrCfg.includes('href: "/hr/attendance"'), "operational attendance /hr/attendance");
  assert(!hrCfg.includes('href: "/dashboard-staff/attendance"'), "personal attendance not primary HR nav");
  assert(
    hrCfg.includes("/pengaturan/organisasi") || hrCfg.includes("/hr/org-structure"),
    "org route existing",
  );
  assert(hrCfg.includes("/hr/recruitment-approvals"), "recruitment route existing");
  assert(hrCfg.includes("workspace.hr.section.sdm"), "SDM section");
  assert(hrCfg.includes("personalSection: undefined") || !hrCfg.includes("personal-attendance"), "no personal primary config");
  const resolve = read("lib/workspace/resolve-workspace.ts");
  assert(resolve.includes("hrWorkspaceConfig"), "HR workspace registered");
  assert(resolve.includes("hasHrFullWorkspaceAccess"), "resolveWorkspaceId uses hub grant");
}

console.log("\nCASE — /hr dashboard is ERP workspace not personal staff");
{
  const hrPage = read("app/(dashboard)/hr/page.tsx");
  assert(hrPage.includes("Meja Kerja"), "dashboard Meja Kerja panel");
  assert(hrPage.includes("StaffDeskWorkbench"), "scoped desk workbench");
  assert(hrPage.includes("HR / SDM"), "HR context header");
  assert(hrPage.includes("/hr/attendance"), "operational attendance link");
  assert(hrPage.includes("/dashboard-staff/attendance"), "personal attendance distinguished");
  assert(!hrPage.includes("StaffRoleWorkspaceStrip"), "not Staff strip dashboard");
}

console.log("\nCASE — Attendance contexts + shared API");
{
  assert(exists("app/(dashboard)/hr/attendance/page.tsx"), "HR attendance route");
  assert(exists("app/(dashboard)/dashboard-staff/attendance/page.tsx"), "personal attendance route");
  assert(read("components/hr/DesktopAttendancePanel.tsx").includes("/api/hr/attendance"), "Desktop attendance API");
  assert(read("lib/hr/attendance-server.ts").includes("getBusinessDateYmd"), "shared business date");
}

console.log("\nCASE — Meja Kerja badges scoped + no silent false-zero");
{
  const desk = read("components/workspace/StaffDeskWorkbench.tsx");
  assert(desk.includes("/api/hr/desk-workbench-summary"), "desk summary API");
  assert(desk.includes("summaryError"), "surfaces summary errors");
  assert(desk.includes("pendingOvertime"), "overtime badge key");
  assert(read("lib/workspace/desk-modules.ts").includes("pendingOvertime"), "overtime desk item");
}

console.log("\nCASE — Navigation de-duplication");
{
  const staff = read("lib/workspace/workspaces/staff.ts");
  const mySubBlock = staff.match(/id: "my-submissions"[\s\S]*?accessPath:[^\n]+/);
  assert(Boolean(mySubBlock && mySubBlock[0].includes("mySubmissions.title")), "my-submissions uses own title key");
  assert(Boolean(mySubBlock && !mySubBlock[0].includes("action.reports.title")), "my-submissions not sharing reports title");
}

console.log("\nCASE — Mobile untouched companion contract");
{
  const mobile = read("app/mobile/page.tsx");
  assert(mobile.includes("companion") || mobile.includes("Companion") || mobile.includes("bukan"), "mobile companion framing");
  assert(exists("mobile/app/(tabs)/kerja.tsx"), "native Meja Kerja kept");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
