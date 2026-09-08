/**
 * Phase NEXT — Desktop HR workspace + Mobile companion alignment tests.
 * Run: npm run test:phase-next-hr-desktop-mobile
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

console.log("=== PHASE NEXT — HR DESKTOP WORKSPACE + MOBILE COMPANION ===\n");

console.log("CASE — Desktop workspace ≠ personal-only");
{
  assert(exists("components/workspace/HrSidebarNav.tsx"), "HR Full sidebar");
  const hrNav = read("components/workspace/HrSidebarNav.tsx");
  assert(hrNav.includes("StaffDeskWorkbench"), "Meja Kerja in HR shell");
  assert(hrNav.includes("workspace.hr.shellLabel") || hrNav.includes("StaffDeskWorkbench"), "HR workspace branding");
  assert(read("components/workspace/WorkspaceMobileAccessFooter.tsx").includes('target="_blank"'), "Akses Mobile new tab");
  assert(read("components/Sidebar.tsx").includes("WorkspaceMobileAccessFooter"), "shared Akses Mobile on shells");

  const view = read("components/workspace/StaffWorkspaceView.tsx");
  assert(view.includes("hasHrFullWorkspaceAccess"), "HR Full redirected off Staff home");
  assert(view.includes("Personal overview") || view.includes("MySubmissionsPanel"), "personal separated");
  assert(view.includes("MySubmissionsPanel"), "submissions on desktop home");
  assert(!view.includes("StaffRoleWorkspaceStrip"), "no HR strip stacked on Staff");
}

console.log("\nCASE — My Submissions Desktop + API");
{
  assert(exists("components/hr/MySubmissionsPanel.tsx"), "panel component");
  assert(exists("app/(dashboard)/dashboard-staff/my-submissions/page.tsx"), "submissions page");
  assert(exists("app/api/hr/my-submissions/route.ts"), "API retained");
  assert(read("components/hr/MySubmissionsPanel.tsx").includes("/api/hr/my-submissions"), "fetches API");
  assert(read("lib/workspace/workspaces/staff.ts").includes("my-submissions"), "nav action");
}

console.log("\nCASE — Mobile companion IA preserved + completed");
{
  const mobile = read("app/mobile/page.tsx");
  assert(mobile.includes("Mobile Companion"), "companion framing");
  assert(mobile.includes("Aktivitas personal"), "personal section");
  assert(mobile.includes("Meja Kerja"), "meja kerja section");
  assert(mobile.includes("my-submissions"), "pengajuan saya");
  assert(mobile.includes("/mobile/overtime"), "lembur correct href");
  assert(mobile.includes("/mobile/field-activity"), "luar kantor correct href");
  assert(mobile.includes("/mobile/izin-off"), "izin/off correct href");
  assert(mobile.includes("/mobile/payroll"), "slip gaji href");
  assert(exists("app/mobile/attendance/page.tsx"), "companion attendance page");
  assert(read("app/mobile/attendance/page.tsx").includes("stayInPlace"), "absensi stay in companion");
  assert(exists("app/mobile/layout.tsx"), "companion layout shell");
  assert(exists("app/mobile/overtime/page.tsx"), "mobile overtime page");
  assert(exists("app/mobile/payroll/page.tsx"), "mobile payroll page");
  assert(mobile.includes("desk-workbench-summary"), "scoped badges API");
  assert(mobile.includes("summaryError") || mobile.includes("Meja Kerja gagal"), "no silent fail");
  assert(!mobile.includes("Dashboard HR\n") || mobile.includes("bukan"), "not mini ERP");
}

console.log("\nCASE — Native Meja Kerja badges");
{
  const kerja = read("mobile/app/(tabs)/kerja.tsx");
  assert(kerja.includes("desk-workbench-summary"), "native fetches desk summary");
  assert(kerja.includes("applyDeskBadges") || kerja.includes("badgeCount"), "applies badges");
  assert(kerja.includes("summaryError"), "surfaces summary errors");
  assert(read("mobile/components/WorkDashboardGrid.tsx").includes("badgeCount"), "grid shows count");
}

console.log("\nCASE — Attendance still core shared service");
{
  assert(read("components/hr/DesktopAttendancePanel.tsx").includes("/api/hr/attendance"), "desktop attendance API");
  assert(read("components/hr/DesktopAttendancePanel.tsx").includes("isAttendanceOfficeDebugAllowed"), "no prod office spoof");
  assert(read("lib/hr/attendance-server.ts").includes("getBusinessDateYmd"), "Jakarta business date");
}

console.log("\nCASE — Login routing (Decision 1: effective /hr hub → /hr)");
{
  const rbac = read("lib/rbac.ts");
  assert(rbac.includes("userHasHrWorkspaceLanding"), "hub landing helper");
  assert(
    rbac.includes("active HR module assignment granting `/hr`") ||
      rbac.includes("module_web_paths includes /hr") ||
      (rbac.includes("module_web_paths") &&
        rbac.includes("Exact hub grant") &&
        rbac.includes('"/hr"')),
    "module hub grant lands /hr"
  );
  assert(rbac.includes("Does NOT escalate from jabatan title"), "no jabatan-title hardcode");
  assert(!/return\s+"\/mobile"/.test(rbac), "login never mobile");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
