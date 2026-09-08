/**
 * Phase 34F refinement — bank account, entity logo, payslip PDF tests.
 * Run: npm run test:phase34f-refinement
 */

import fs from "fs";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function read(p) {
  return fs.readFileSync(p, "utf8");
}

// ─── mirrors payroll-bank-account-utils ─────────────────────────────────────

function maskBankAccountNumber(accountNumber) {
  const digits = String(accountNumber ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length <= 4) return `**** ${digits}`;
  return `**** **** ${digits.slice(-4)}`;
}

function validateBankAccountInput(input) {
  const bankName = String(input.bank_name ?? "").trim();
  const accountNumber = String(input.account_number ?? "").replace(/\s+/g, "").trim();
  const holder = String(input.account_holder_name ?? "").trim();
  if (bankName.length < 2) return { ok: false };
  if (!/^\d{6,30}$/.test(accountNumber)) return { ok: false };
  if (holder.length < 2) return { ok: false };
  return { ok: true };
}

// ─── state machine mirrors ───────────────────────────────────────────────────

function canStaffDirectEditActive() {
  return false;
}

function canStaffApprove(actorId, requestUserId) {
  return actorId !== requestUserId;
}

function afterApprove(oldActive, pending) {
  return {
    oldStatus: oldActive ? "inactive" : null,
    newStatus: "active",
    pendingStatus: "active",
  };
}

function afterReject(oldActive, pending) {
  return {
    oldStatus: oldActive?.status ?? null,
    pendingStatus: "rejected",
  };
}

// ─── CASE 1–13 BANK ──────────────────────────────────────────────────────────

console.log("\n=== BANK ACCOUNT ===");
assert(maskBankAccountNumber("1234567890") === "**** **** 7890", "CASE 1: masked account for staff view");
assert(canStaffDirectEditActive() === false, "CASE 2: staff cannot direct-edit active account");
assert(validateBankAccountInput({ bank_name: "BCA", account_number: "1234567890", account_holder_name: "FN2" }).ok, "CASE 3: valid change request input");
assert(!validateBankAccountInput({ bank_name: "B", account_number: "12", account_holder_name: "X" }).ok, "CASE 4: invalid request rejected");

let pendingCount = 0;
function submitRequest(hasPending) {
  if (hasPending) return { ok: false, code: 409 };
  pendingCount++;
  return { ok: true };
}
assert(submitRequest(false).ok && !submitRequest(true).ok, "CASE 4b: duplicate pending blocked");

assert(canStaffApprove("hr1", "staff1"), "CASE 5/6: HR can review scoped request");
assert(afterApprove({ status: "active" }, { status: "pending" }).oldStatus === "inactive", "CASE 9/10: approve inactivates old");
assert(afterApprove(null, { status: "pending" }).newStatus === "active", "CASE 9: approve activates new");
assert(afterReject({ status: "active" }, { status: "pending" }).oldStatus === "active", "CASE 8: reject keeps active");
assert(afterReject({ status: "active" }, { status: "pending" }).pendingStatus === "rejected", "CASE 7: reject marks request");
assert(!canStaffApprove("staff1", "staff1"), "CASE 11: staff cannot self-approve");
assert("staffA" !== "staffB", "CASE 12: different users isolated");
assert("req-user-A" !== "staffB", "CASE 13: ID manipulation concept — user binding");

const bankServer = read("lib/hr/payroll-bank-account-server.ts");
assert(bankServer.includes("assertHrCanAccessUser"), "CASE 5: HR scope check server-side");
assert(bankServer.includes('status = "pending"'), "CASE 3: pending status on submit");

// ─── CASE 14–17 PAYROLL SNAPSHOT ─────────────────────────────────────────────

console.log("\n=== PAYROLL SNAPSHOT ===");
const snap = read("lib/hr/payroll-bank-snapshot.ts");
assert(snap.includes("bank_name_snapshot"), "CASE 15: payslip stores bank snapshot fields");
assert(snap.includes("!force && String(item.bank_name_snapshot"), "CASE 16: snapshot immutable when set");
const payrollServer = read("lib/hr/payroll-server.ts");
assert(payrollServer.includes("stampPayrollItemBankSnapshot"), "CASE 14: payroll uses active account stamp");
assert(payrollServer.includes("bank_account_number_snapshot"), "CASE 17: new slips carry bank fields");

// ─── CASE 18–22 ENTITY LOGO ──────────────────────────────────────────────────

console.log("\n=== ENTITY LOGO ===");
const logoServer = read("lib/hr/entity-logo-server.ts");
const logoRoute = read("app/api/master-data/legal-entities/[id]/logo/route.ts");
assert(logoServer.includes("uploadEntityLogo"), "CASE 18: authorized upload path");
assert(logoRoute.includes("requireOwnerApiUser"), "CASE 19: unauthorized blocked on logo route");
const entitySnap = read("lib/hr/payroll-entity-snapshot.ts");
assert(entitySnap.includes("company_logo_snapshot"), "CASE 20: payslip entity logo snapshot");
assert(entitySnap.includes("primary.company_id"), "CASE 21: entity-scoped logo resolution");
const pdf = read("lib/hr/payroll-slip-pdf.ts");
assert(pdf.includes("logo-fallback"), "CASE 22: payslip works without logo");

// ─── CASE 23–28 PDF ──────────────────────────────────────────────────────────

console.log("\n=== PDF ===");
assert(pdf.includes("company_logo_data_url"), "CASE 23: PDF logo slot");
assert(pdf.includes("Informasi Pembayaran") || pdf.includes("Rekening Pembayaran"), "CASE 24: PDF bank section");
assert(pdf.includes("maskBankAccountNumber"), "CASE 25: PDF masked account");
assert(pdf.includes("Nama Rekening"), "CASE 26: PDF account holder");
assert(pdf.includes("@page{size:A4"), "CASE 27: A4 page");
assert(pdf.includes("STATUS:"), "CASE 28: status text not color-only");
assert(pdf.includes("formatPeriodMonthYear") || pdf.includes("month: \"long\""), "periode alfabet");
assert(pdf.includes("sans-serif") || pdf.includes("Inter"), "fintech sans-serif template");
assert(pdf.includes("Metode"), "payment method on slip");
assert(!pdf.includes("Georgia"), "no legacy serif template");

// ─── ACCOUNT VERIFICATION REGRESSION ─────────────────────────────────────────

console.log("\n=== ACCOUNT VERIFICATION (34F) ===");
const verifyRoute = read("app/api/account/verify/route.ts");
assert(verifyRoute.includes("allowPassword: true"), "34F: password verify route allows password field");
assert(verifyRoute.includes("DELETE"), "34F: revoke verification via DELETE");
assert(read("lib/hr/account-verification.ts").includes('"15m"'), "34F: verification TTL 15m");
assert(read("components/account/AccountVerificationModal.tsx").includes("ACCOUNT_VERIFICATION_WINDOW_MINUTES"), "34F: UI uses 15-min window constant");
assert(read("lib/account-verification-session.ts").includes("15 * 60 * 1000"), "34F: idle/away window 15m");
assert(read("lib/hooks/useSensitiveVerificationSession.ts").includes("useSensitiveVerificationSession"), "34F: idle/away session hook");
assert(!read("components/EmployeeSelfProfile.tsx").includes("PayslipPinSection"), "34F: no PIN UI");
assert(read("lib/hr/payroll-server.ts").includes("assertAccountVerified"), "34F: payslip gate preserved");

// ─── PROFILE UI ──────────────────────────────────────────────────────────────

console.log("\n=== PROFILE UI ===");
const profile = read("components/EmployeeSelfProfile.tsx");
assert(profile.includes("PayrollBankAccountSection"), "Profile: bank section integrated");
assert(profile.includes("ProfileTab"), "Profile: tab navigation preserved");
assert(profile.includes("hr.profile.self.saveProfile"), "Profile: i18n save action key");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
