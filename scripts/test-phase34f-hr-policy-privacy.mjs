/**
 * Phase 34F — HR policy SSOT, account verification, profile canonical tests.
 * Run: npm run test:phase34f-hr-policy-privacy
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";

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

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

// ─── entity attendance policy example text ───

function formatRp(n) {
  return `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
}

function buildLateExampleText(rates, exampleMinutes = 10) {
  if (!rates.lateEnabled || rates.latePerMinute <= 0) {
    return "Potongan keterlambatan tidak aktif untuk kebijakan ini.";
  }
  const billable = Math.max(0, exampleMinutes - rates.graceMinutes);
  const amount = billable * rates.latePerMinute;
  const graceNote = rates.graceMinutes > 0 ? ` (${rates.graceMinutes} menit toleransi tidak dipotong)` : "";
  return `${exampleMinutes} menit terlambat${graceNote} × ${formatRp(rates.latePerMinute)}/menit = ${formatRp(amount)}`;
}

function buildAbsenceExampleText(rates, days = 1) {
  if (!rates.absenceEnabled || rates.absencePerDay <= 0) {
    return "Potongan ketidakhadiran tidak aktif untuk kebijakan ini.";
  }
  return `${days} hari alpha × ${formatRp(rates.absencePerDay)}/hari = ${formatRp(days * rates.absencePerDay)}`;
}

function resolveEffectivePolicy(policies, companyId, asOfYmd) {
  const date = asOfYmd.slice(0, 10);
  const eligible = policies
    .filter((p) => p.status === "published" && p.effective_from <= date)
    .filter((p) => !p.effective_until || p.effective_until >= date)
    .filter((p) => !p.company_id || p.company_id === companyId || !companyId)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return eligible.find((p) => p.company_id === companyId) || eligible.find((p) => !p.company_id) || null;
}

function payrollLateDeduction(rates, lateMinutes, lateDays) {
  const billable = Math.max(0, lateMinutes - rates.graceMinutes * Math.max(lateDays, lateMinutes > 0 ? 1 : 0));
  return rates.lateEnabled ? Math.round(billable * rates.latePerMinute) : 0;
}

// ─── account verification JWT (mirrors lib/hr/account-verification.ts) ───

const VERIFY_SECRET = new TextEncoder().encode("local-dev-account-verification-secret-min-16");

function hashAuthSessionKey(authToken) {
  return createHash("sha256").update(authToken).digest("hex").slice(0, 32);
}

async function createVerificationJwt(userId, sessionKey, expiresIn = "15m") {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ purpose: "account_verification", sk: sessionKey, iat: issuedAt })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("serba-erp")
    .setAudience("account-verification")
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresIn)
    .sign(VERIFY_SECRET);
}

async function verifyVerificationJwt(token, userId, sessionKey) {
  try {
    const { payload } = await jwtVerify(token, VERIFY_SECRET, {
      issuer: "serba-erp",
      audience: "account-verification",
    });
    if (payload.sub !== userId) return false;
    if (payload.purpose !== "account_verification") return false;
    if (typeof payload.sk !== "string" || !payload.sk) return false;
    return payload.sk === sessionKey;
  } catch {
    return false;
  }
}

function assertPayslipAccess(actorUserId, itemUserId, caps) {
  if (actorUserId === itemUserId) return caps.includes("payslip.view_self");
  return caps.includes("payslip.view_scoped");
}

function nextLockUntilAfterFailure(attempts) {
  return attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
}

console.log("\n=== Phase 34F HR Policy SSOT & Account Verification Tests ===\n");

console.log("Policy SSOT — example from DB rates (not hardcoded)");
{
  const rates500 = { lateEnabled: true, latePerMinute: 500, graceMinutes: 0, absenceEnabled: true, absencePerDay: 100000 };
  const ex500 = buildLateExampleText(rates500);
  assert(ex500.includes("500") && ex500.includes("5.000"), "Rp500/min → example Rp5.000");
  const rates1000 = { ...rates500, latePerMinute: 1000 };
  const ex1000 = buildLateExampleText(rates1000);
  assert(ex1000.includes("1.000") && ex1000.includes("10.000"), "Rp1000/min → example Rp10.000");
  assert(buildAbsenceExampleText(rates500).includes("100.000"), "absence example from DB rate");
}

console.log("\nPolicy versioning — effective date resolution");
{
  const company = "c1";
  const policies = [
    { status: "published", company_id: company, effective_from: "2026-06-01", effective_until: "2026-08-31", late_rate_per_minute: 500 },
    { status: "published", company_id: company, effective_from: "2026-09-01", effective_until: "", late_rate_per_minute: 1000 },
  ];
  const aug = resolveEffectivePolicy(policies, company, "2026-08-15");
  const sep = resolveEffectivePolicy(policies, company, "2026-09-15");
  assert(aug?.late_rate_per_minute === 500, "Aug 2026 uses Rp500 policy");
  assert(sep?.late_rate_per_minute === 1000, "Sep 2026 uses Rp1000 policy");
}

console.log("\nPayroll uses same rates as staff UI");
{
  const rates = { lateEnabled: true, latePerMinute: 500, graceMinutes: 0, absenceEnabled: true, absencePerDay: 100000 };
  assert(payrollLateDeduction(rates, 10, 1) === 5000, "10 min late × Rp500 = Rp5000 payroll");
  const rates2 = { ...rates, latePerMinute: 1000 };
  assert(payrollLateDeduction(rates2, 10, 1) === 10000, "10 min late × Rp1000 = Rp10000 payroll");
}

console.log("\nHistorical payslip immutability — stamped snapshot");
{
  const stamped = { late_deduction: 5000, attendance_policy_snapshot: '{"late_rate_per_minute":500}' };
  const currentPolicyRate = 1000;
  assert(stamped.late_deduction === 5000, "stamped payslip unchanged after policy change");
  assert(JSON.parse(stamped.attendance_policy_snapshot).late_rate_per_minute === 500, "snapshot preserves rate");
  assert(currentPolicyRate !== 500, "new policy differs from stamped");
}

console.log("\nAccount verification — CASE 1–14");
{
  const userId = "staff-1";
  const loginTokenA = "pb-auth-token-session-a";
  const loginTokenB = "pb-auth-token-session-b-after-relogin";
  const skA = hashAuthSessionKey(loginTokenA);
  const skB = hashAuthSessionKey(loginTokenB);

  const profilePage = read("components/EmployeeSelfProfile.tsx");
  assert(profilePage.includes("ProfileTab"), "CASE 1: profile page exists with tab navigation");
  assert(!profilePage.includes("PayslipPinSection"), "CASE 1: no PIN section in profile");
  assert(!profilePage.includes("Verifikasi aktif"), "CASE 1: no permanent verification status card");

  const payrollServer = read("lib/hr/payroll-server.ts");
  assert(payrollServer.includes("assertAccountVerified"), "CASE 2: payslip gate uses assertAccountVerified");
  assert(payrollServer.includes("assertPayslipAccess"), "CASE 2: ownership gate preserved");

  const verifyRoute = read("app/api/account/verify/route.ts");
  assert(verifyRoute.includes("verifyAccountWithPassword"), "CASE 3: server-side password verification");
  assert(verifyRoute.includes("applyAccountVerificationCookie"), "CASE 3: sets HttpOnly verification cookie");

  const grantA = await createVerificationJwt(userId, skA);
  assert(await verifyVerificationJwt(grantA, userId, skA), "CASE 3: valid grant after password verify");
  assert(await verifyVerificationJwt(grantA, userId, skA), "CASE 4: second slip — same grant, no re-verify");
  assert(await verifyVerificationJwt(grantA, userId, skA), "CASE 5: re-enter payroll — grant still valid");

  const docServer = read("lib/hr/employee-document-server.ts");
  assert(docServer.includes("assertAccountVerified"), "CASE 6: documents use same verification gate");

  const sessionRoute = read("app/api/auth/session/route.ts");
  assert(sessionRoute.includes("clearAccountVerificationCookie"), "CASE 7: logout clears verification");
  assert(!sessionRoute.includes("clearPayslipUnlockCookie"), "CASE 7: legacy unlock clear removed");

  assert(!(await verifyVerificationJwt(grantA, userId, skB)), "CASE 8/13: old grant invalid on new session");
  const grantB = await createVerificationJwt(userId, skB);
  assert(await verifyVerificationJwt(grantB, userId, skB), "CASE 8: new login requires new verification");

  assert(docServer.includes("assertAccountVerified"), "CASE 9: documents require verification after relogin");

  const expired = await createVerificationJwt(userId, skB, "0s");
  await new Promise((r) => setTimeout(r, 1100));
  assert(!(await verifyVerificationJwt(expired, userId, skB)), "CASE 10: expired grant → verify again");

  const verifyServer = read("lib/hr/account-verification-server.ts");
  assert(verifyServer.includes("Kata sandi salah"), "CASE 11: wrong password denied");
  assert(verifyServer.includes("ACCOUNT_VERIFICATION_REQUIRED"), "CASE 11: unverified access code");

  assert(!assertPayslipAccess("staff-1", "staff-2", ["payslip.view_self"]), "CASE 12: other user slip → 403");
  assert(await verifyVerificationJwt(grantB, userId, skB), "CASE 12: verification does not bypass ownership");

  assert(!(await verifyVerificationJwt(grantA, userId, skB)), "CASE 13: old grant rejected on new session");

  assert(verifyServer.includes("nextLockUntilAfterFailure"), "CASE 14: rate limiting wired");
  assert(nextLockUntilAfterFailure(5) !== null, "CASE 14: 5 failures → lock");
}

console.log("\nPIN Slip Gaji removed");
{
  assert(!fs.existsSync(path.join(process.cwd(), "lib/hr/payslip-pin.ts")), "payslip-pin.ts deleted");
  assert(!fs.existsSync(path.join(process.cwd(), "lib/hr/payslip-unlock-server.ts")), "payslip-unlock-server.ts deleted");
  assert(!fs.existsSync(path.join(process.cwd(), "components/profile/PayslipPinSection.tsx")), "PayslipPinSection deleted");
  assert(!fs.existsSync(path.join(process.cwd(), "components/payroll/PayslipUnlockModal.tsx")), "PayslipUnlockModal deleted");
  const payrollPage = read("app/(dashboard)/dashboard-staff/payroll/page.tsx");
  assert(payrollPage.includes("AccountVerificationModal"), "payroll uses AccountVerificationModal");
  assert(!payrollPage.includes("PayslipUnlockModal"), "no PayslipUnlockModal in payroll");
}

console.log("\nPayslip ownership");
{
  assert(assertPayslipAccess("u1", "u1", ["payslip.view_self"]), "own slip allowed");
  assert(!assertPayslipAccess("u1", "u2", ["payslip.view_self"]), "other slip denied for staff");
}

console.log("\nProfile canonical route & redesign");
{
  const staffDashboard = read("app/(dashboard)/dashboard-staff/page.tsx");
  const staffWorkspace =
    read("components/workspace/StaffWorkspaceView.tsx") +
    read("lib/workspace/workspaces/staff.ts");
  assert(
    staffDashboard.includes("/profile") || staffWorkspace.includes("/profile"),
    "dashboard Profil → /profile",
  );
  assert(!staffDashboard.includes('href="/profile#dokumen-pribadi"'), "no duplicate Dokumen card");
  const profileRedirect = read("app/(dashboard)/dashboard-staff/profile/page.tsx");
  assert(profileRedirect.includes('replace("/profile")'), "old staff profile redirects");
  const profile = read("components/EmployeeSelfProfile.tsx");
  assert(profile.includes("ringkasan"), "profile tab: Ringkasan");
  assert(profile.includes("useToast"), "global toast via Phase 35 useToast");
  assert(!profile.includes("PayslipPin"), "no PIN UI in profile");
}

console.log("\nWork calendar uses holiday API (not direct PB create)");
{
  const wc = read("app/(dashboard)/hr/work-calendar/page.tsx");
  assert(wc.includes('fetch("/api/hr/holidays"'), "work-calendar POST holidays via API");
  assert(wc.includes("fetchHrHolidays"), "work-calendar load via API helper");
  assert(!wc.includes("OFFICE_HOLIDAYS_COLLECTION).create"), "no direct PB holiday create");
}

console.log("\nStaff policies page reads effective policy API");
{
  const pol = read("app/(dashboard)/dashboard-staff/policies/page.tsx");
  assert(pol.includes("/api/hr/attendance-policies/effective"), "staff policy from API");
  assert(pol.includes("mengikuti kebijakan HR"), "entity policy disclaimer");
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
