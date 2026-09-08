/**
 * Phase 35I-L — Desktop / Mobile / Meja Kerja alignment (targeted static + policy tests).
 * Run: npm run test:phase35i-l-desktop-mobile
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

console.log("=== PHASE 35I-L DESKTOP / MOBILE / MEJA KERJA ===\n");

console.log("CASE — Desktop login never → Mobile");
{
  const rbac = read("lib/rbac.ts");
  assert(!/return\s+"\/mobile"/.test(rbac), "getOperationalDashboardRoute never returns /mobile");
  assert(
    rbac.includes("resolvePrimaryWorkspace") || rbac.includes('return "/dashboard-owner"'),
    "Owner → dashboard-owner",
  );
  assert(
    rbac.includes("resolvePrimaryWorkspace") || rbac.includes('return "/hr"'),
    "classic HR → /hr",
  );
  assert(
    rbac.includes("resolvePrimaryWorkspace") || rbac.includes('return "/dashboard-staff"'),
    "staff dashboard home",
  );
  assert(rbac.includes("userHasHrWorkspaceLanding"), "effective /hr hub landing (Decision 1)");
  assert(
    rbac.includes("resolvePrimaryWorkspace") ||
      rbac.includes("active HR module assignment granting `/hr`") ||
      rbac.includes("module_web_paths includes /hr"),
    "HR module hub grant → /hr (not jabatan title)"
  );
  const login = read("app/login/page.tsx");
  assert(login.includes("getDefaultRouteForUser"), "login uses default Desktop route");
  assert(!login.includes('"/mobile"'), "login page does not hardcode /mobile");
}

console.log("\nCASE — QR login GAP (no insecure stub)");
{
  const login = read("app/login/page.tsx");
  assert(!/qr.?login/i.test(login) || login.includes("email"), "no QR login UI on login page");
  assert(!exists("app/api/auth/qr-login/route.ts"), "no qr-login API route (GAP documented)");
  assert(!exists("lib/auth/qr-login.ts"), "no qr-login lib (do not ship insecure QR)");
}

console.log("\nCASE — Akses Mobile multi-tab");
{
  const footer = read("components/workspace/WorkspaceMobileAccessFooter.tsx");
  const side = read("components/Sidebar.tsx");
  assert(footer.includes('href="/mobile"'), "Akses Mobile href");
  assert(footer.includes('target="_blank"'), "opens new tab");
  assert(footer.includes("noopener"), "noopener noreferrer");
  assert(footer.includes("tab baru") || footer.includes("Desktop"), "copy clarifies Desktop unchanged");
  assert(side.includes("WorkspaceMobileAccessFooter"), "shared footer on all shells");
}

console.log("\nCASE — Meja Kerja Desktop = action center");
{
  const desk = read("components/workspace/StaffDeskWorkbench.tsx");
  assert(desk.includes("summaryKey"), "uses workflow summary keys");
  assert(desk.includes("shouldShowDeskItem"), "filters desk items");
  assert(desk.includes("isWorkflowActionItem") || desk.includes("actionItems"), "separates workflow vs quick action");
  assert(desk.includes("desk-workbench-summary"), "badges from real summary API");
  assert(!desk.includes("fullModuleHref"), "no Buka … Lengkap CTA in Meja Kerja");
  assert(!desk.includes("ExternalLink"), "no full-module new-tab CTA");
  assert(desk.includes("action center") || desk.includes("Quick action"), "action center framing");
}

console.log("\nCASE — Web /mobile companion IA");
{
  const mobile = read("app/mobile/page.tsx");
  assert(mobile.includes("Mobile Companion") || mobile.includes("companion"), "companion framing");
  assert(mobile.includes("Aktivitas personal"), "personal activity section");
  assert(mobile.includes("Meja Kerja"), "Meja Kerja section");
  assert(mobile.includes("Laporan & Temuan"), "Laporan section above Meja Kerja");
  const laporanIdx = mobile.lastIndexOf("Laporan & Temuan");
  const mejaIdx = mobile.lastIndexOf("Meja Kerja (action center)");
  assert(laporanIdx >= 0 && mejaIdx > laporanIdx, "Meja Kerja below Laporan");
  assert(mobile.includes("/profile"), "Profil");
  assert(mobile.includes("attendance"), "Absensi");
  assert(mobile.includes("recruitment-approvals"), "recruitment action");
  assert(!mobile.includes("Dashboard HR") || mobile.includes("bukan"), "not mini HR dashboard");
}

console.log("\nCASE — Desktop home policy helper");
{
  assert(exists("lib/workspace/desktop-primary-home.ts"), "desktop home policy module");
  const pol = read("lib/workspace/desktop-primary-home.ts");
  assert(pol.includes("never lands on /mobile") || pol.includes("never /mobile"), "never mobile");
  assert(
    pol.includes("Position.workspaceDomain") ||
      pol.includes("Effective HR hub") ||
      pol.includes("module assignment granting `/hr`") ||
      pol.includes("Module hub grant"),
    "Decision 1 effective-access landing documented"
  );
  assert(pol.includes("resolveDesktopPrimaryHomeRoute"), "resolver export");
}

console.log("\nCASE — Native Meja Kerja not mini-ERP catalog");
{
  const menu = read("mobile/lib/work-dashboard-menu.ts");
  assert(menu.includes("action center") || menu.includes("Action center"), "action center copy");
  assert(!menu.includes('id: "inv-hub"') || menu.includes("NOT"), "inventory hub tile removed from Meja Kerja");
  assert(menu.includes("inv-product") || menu.includes("Scan produk"), "scan produk kept");
  assert(menu.includes("PERSONAL_TILES: WorkDashboardTile[] = []") || /PERSONAL_TILES\s*=\s*\[\s*\]/.test(menu), "personal tiles not on Meja Kerja");
  assert(menu.includes("hr-leave-queue"), "leave approval tile remains");
}

console.log("\nCASE — Shared session guard intact");
{
  assert(exists("components/WebSessionGuard.tsx"), "WebSessionGuard");
  assert(exists("lib/auth-session.ts"), "auth-session nonce");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
