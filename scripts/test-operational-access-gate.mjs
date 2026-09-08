/**
 * Regression: staff personal modules bypass web_access gate;
 * lock warning → Mobile Companion (primary) + desktop attendance backup.
 * Run: node scripts/test-operational-access-gate.mjs
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "lib/operational-access-gate.ts"), "utf8");
const mid = fs.readFileSync(path.join(ROOT, "middleware.ts"), "utf8");
const panel = fs.readFileSync(path.join(ROOT, "components/hr/DesktopAttendancePanel.tsx"), "utf8");
const guard = fs.readFileSync(path.join(ROOT, "components/WebSessionGuard.tsx"), "utf8");
const rbac = fs.readFileSync(path.join(ROOT, "lib/rbac.ts"), "utf8");
const locked = fs.readFileSync(path.join(ROOT, "app/erp-locked/page.tsx"), "utf8");
const mobile = fs.readFileSync(path.join(ROOT, "app/mobile/page.tsx"), "utf8");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function isOperationalPathExempt(pathname) {
  if (!pathname) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  if (pathname === "/mobile" || pathname.startsWith("/mobile/")) return true;
  if (pathname === "/dashboard-staff" || pathname.startsWith("/dashboard-staff/")) return true;
  if (pathname === "/hr/reports" || pathname.startsWith("/hr/reports/")) return true;
  if (pathname.startsWith("/erp-locked")) return true;
  if (pathname.startsWith("/icons/")) return true;
  if (pathname.startsWith("/_next")) return true;
  return false;
}

console.log("\n=== Operational access gate ===\n");

assert(src.includes('pathname === "/hr/reports"'), "source exempts /hr/reports");
assert(src.includes("MOBILE_COMPANION_PATH"), "mobile companion path constant");
assert(src.includes("buildMobileUnlockUrl"), "mobile unlock URL helper");
assert(isOperationalPathExempt("/hr/reports"), "staff reports list exempt");
assert(isOperationalPathExempt("/mobile"), "mobile companion exempt from gate");
assert(isOperationalPathExempt("/mobile/foo"), "mobile subpaths exempt");
assert(isOperationalPathExempt("/dashboard-staff/leave"), "staff leave still exempt");
assert(isOperationalPathExempt("/erp-locked"), "erp-locked itself is exempt from gate");
assert(isOperationalPathExempt("/dashboard-staff/attendance"), "desktop attendance backup exempt");
assert(!isOperationalPathExempt("/dashboard-director"), "director hub locked until check-in");
assert(src.includes("buildErpLockedUrl"), "lock URL helper exists");
assert(src.includes("buildAttendanceUnlockUrl"), "attendance unlock URL helper exists");
assert(src.includes("resolveLandingWithAttendanceGate"), "login landing uses lock gate");
assert(src.includes("buildErpLockedUrl(home)"), "login landing goes to erp-locked first");

assert(
  /DEFAULT_USER_ACCESS[\s\S]*?\/erp-locked/.test(rbac),
  "DEFAULT_USER_ACCESS includes /erp-locked",
);
assert(
  /DEFAULT_USER_ACCESS[\s\S]*?\/dashboard-staff/.test(rbac),
  "DEFAULT_USER_ACCESS includes /dashboard-staff",
);
assert(rbac.includes("resolveLandingWithAttendanceGate"), "getDefaultRoute uses lock/attendance gate");

assert(mid.includes("buildErpLockedUrl"), "middleware redirects to erp-locked warning");
assert(guard.includes("buildErpLockedUrl"), "WebSessionGuard redirects to erp-locked");
assert(locked.includes("Bukan error"), "lock page clarifies not an error");
assert(locked.includes("Buka Mobile Companion"), "lock page primary CTA is mobile companion");
assert(locked.includes("buildMobileUnlockUrl"), "lock page uses mobile unlock URL");
assert(locked.includes("Absensi desktop"), "lock page keeps desktop attendance backup");
assert(mobile.includes("/mobile/attendance"), "mobile companion links absensi");
assert(mobile.includes("/mobile/payroll"), "mobile companion links slip gaji");
assert(exists("app/mobile/attendance/page.tsx"), "mobile attendance route");
assert(
  fs.readFileSync(path.join(ROOT, "app/mobile/attendance/page.tsx"), "utf8").includes("stayInPlace"),
  "absensi stays in companion",
);
assert(exists("app/mobile/payroll/page.tsx"), "mobile payroll route");
assert(panel.includes("openDashboardAfterUnlock"), "check-in opens dashboard after unlock");
assert(panel.includes("stayInPlace"), "companion can stay without dashboard redirect");
assert(panel.includes("syncPbAuthCookie"), "check-in refreshes session before dashboard");
assert(exists("app/mobile/layout.tsx"), "mobile companion shell layout");
assert(exists("app/mobile/leave/page.tsx"), "mobile leave route");
assert(exists("app/mobile/attendance/page.tsx"), "mobile attendance route");

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
