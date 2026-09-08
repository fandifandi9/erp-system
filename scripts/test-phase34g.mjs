/**
 * Phase 34G — entity identity + effective-dated payroll bank tests.
 * Run: npm run test:phase34g
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
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("=== PHASE 34G STATIC TESTS ===\n");

const bankServer = read("lib/hr/payroll-bank-account-server.ts");
const bankSnap = read("lib/hr/payroll-bank-snapshot.ts");
const bankDates = read("lib/hr/payroll-bank-dates.ts");
const bankAuth = read("lib/hr/payroll-bank-auth.ts");
const entityId = read("lib/hr/entity-identity-server.ts");
const entitySnap = read("lib/hr/payroll-entity-snapshot.ts");
const pdf = read("lib/hr/payroll-slip-pdf.ts");
const profile = read("components/profile/PayrollBankAccountSection.tsx");
const approval = read("components/hr/PayrollBankApprovalPanel.tsx");
const attendance = read("components/hr/DesktopAttendancePanel.tsx");
const verify = read("lib/hr/account-verification-server.ts");
const mig = read("scripts/migrate-local-hr-phase34g.mjs");

assert(bankDates.includes("isYmdInEffectiveRange"), "1-2: effective date range helper");
assert(bankServer.includes("getPayrollBankAccountForUserAsOf"), "10-11: period-aware bank resolution");
assert(bankServer.includes("effective_until"), "9: effective_until on approve");
assert(bankServer.includes("effective_from"), "9: effective_from on approve");
assert(bankServer.includes("created_by"), "3: created_by on submit");
assert(bankServer.includes("last_rejected"), "8: rejected state in self view");
assert(bankServer.includes("assertPayrollBankApprover"), "5-6: payroll.bank.approve gate");
assert(bankServer.includes("Alasan penolakan wajib"), "7: reject requires reason");
assert(bankSnap.includes("resolvePayrollAsOfDate"), "10-12: snapshot uses payroll period date");
assert(bankSnap.includes("getPayrollBankAccountForUserAsOf"), "12: snapshot not realtime active only");
assert(entityId.includes("getEntityIdentityForUser"), "13-14: entity identity SSOT");
assert(entityId.includes("assertLegalEntityReadableByActor"), "13: entity scoping");
assert(entitySnap.includes("company_legal_name_snapshot"), "14: legal name on payslip snapshot");
assert(pdf.includes("Informasi Pembayaran"), "J: payslip payment section label");
assert(pdf.includes("company_legal_name"), "J: legal name on payslip PDF");
assert(profile.includes("REKENING BANK") || profile.includes("Rekening Bank"), "H: profile bank section");
assert(profile.includes("last_rejected"), "H: rejected UI");
assert(profile.includes("PAYROLL_BANK_OPTIONS"), "H: bank picker");
assert(approval.includes("Review"), "I: HR review flow");
assert(approval.includes("effective_from") || approval.includes("effectiveFrom"), "I: effective date on approve");
assert(approval.includes("rejectReason"), "I: reject reason required in UI");
assert(attendance.includes("entity-identity"), "15: attendance uses entity identity");
assert(!read("components/EmployeeSelfProfile.tsx").includes("PayslipPinSection"), "20: no PIN slip gaji UI");
assert(verify.includes("assertAccountVerified") || verify.includes("ACCOUNT_VERIFIED_COOKIE"), "17-19: account verification preserved");
assert(mig.includes("effective_from"), "L: migration adds effective_from");
assert(mig.includes("display_name"), "L: migration adds display_name");
assert(mig.includes('textField("city")'), "L: migration adds city");
assert(mig.includes('textField("phone")'), "L: migration adds phone");
assert(mig.includes('textField("website")'), "L: migration adds website");
assert(mig.includes('textField("address")'), "L: migration adds address");
assert(mig.includes('textField("npwp")'), "L: migration adds npwp");
assert(mig.includes('textField("email")'), "L: migration adds email");
assert(read("lib/master-data/legal-entity.ts").includes("patch.website"), "update persists website");
assert(read("lib/master-data/legal-entity.ts").includes("patch.city"), "update persists city");
assert(read("lib/master-data/legal-entity.ts").includes("patch.phone"), "update persists phone");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
