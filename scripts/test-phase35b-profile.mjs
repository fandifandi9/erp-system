/**
 * Phase 35B — /profile UI migration to global design system.
 * Run: npm run test:phase35b-profile
 */

import fs from "fs";

const root = process.cwd();
let passed = 0;
let failed = 0;

function read(rel) {
  return fs.readFileSync(`${root}/${rel}`, "utf8");
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

console.log("=== PHASE 35B PROFILE MIGRATION TESTS ===\n");

const profile = read("components/EmployeeSelfProfile.tsx");
const profilePage = read("app/profile/page.tsx");
const bank = read("components/profile/PayrollBankAccountSection.tsx");
const docs = read("components/profile/EmployeePrivateDocumentsSection.tsx");

// Scope — only /profile
assert(profilePage.includes("EmployeeSelfProfile"), "profile route uses EmployeeSelfProfile");
assert(!profilePage.includes("dashboard-staff"), "profile page not staff dashboard");

// Phase 35 primitives
assert(profile.includes("PageShell"), "uses PageShell");
assert(profile.includes("from \"@/components/ui\""), "uses global UI barrel");
assert(profile.includes("Tabs"), "uses Tabs");
assert(profile.includes("TabPanel"), "uses TabPanel");
assert(profile.includes("Card"), "uses Card");
assert(profile.includes("FormSection"), "uses FormSection");
assert(profile.includes("useToast"), "uses global Toast");
assert(!profile.includes("ProfileFeedbackToast"), "legacy ProfileFeedbackToast removed");

// ToastProvider on standalone route
assert(profilePage.includes("ToastProvider"), "profile page wraps ToastProvider");

// Tab IA + hash compatibility
assert(profile.includes("ProfileTab"), "ProfileTab type preserved");
assert(profile.includes("dokumen-pribadi"), "legacy hash dokumen-pribadi");
assert(profile.includes("keamanan-slip-gaji"), "legacy hash keamanan-slip-gaji");
assert(profile.includes("ringkasan"), "ringkasan tab");
assert(profile.includes("profile.tabs."), "tab labels i18n");

// Business logic preserved
assert(profile.includes("fetchSelfProfileApi"), "GET self profile API");
assert(profile.includes("patchSelfProfileApi"), "PATCH self profile API");
assert(profile.includes("uploadSelfAvatarApi"), "avatar upload API");
assert(profile.includes("PayrollBankAccountSection"), "payroll bank section");
assert(profile.includes("EmployeePrivateDocumentsPanel"), "documents panel");
assert(!profile.includes("PayslipPin"), "no payslip PIN UI");

// Security tab
assert(profile.includes("/api/profile/self/password"), "change password API");
assert(!profile.includes("PayslipPinSection"), "no PIN section");

// Bank workflow (34G)
assert(bank.includes("PAYROLL_BANK_OPTIONS"), "bank picker preserved");
assert(bank.includes("last_rejected"), "rejected state UI");
assert(bank.includes("Ajukan perubahan rekening"), "request change — not direct save");
assert(!bank.includes("Simpan Rekening"), "no direct active bank save");

// Documents + verification (34F)
assert(docs.includes("AccountVerificationModal"), "AccountVerificationModal preserved");
assert(docs.includes("ACCOUNT_VERIFICATION_REQUIRED"), "verification gate on doc access");
assert(docs.includes("StatusBadge"), "document status badges");

// i18n
assert(read("lib/i18n/messages/design-id.ts").includes("ringkasan: \"Ringkasan\""), "ID tab translations");
assert(read("lib/i18n/messages/design-en.ts").includes("ringkasan: \"Summary\""), "EN tab translations");

// No mass migration
const staffDash = read("app/(dashboard)/dashboard-staff/page.tsx");
assert(staffDash.includes("StaffWorkspaceView"), "staff dashboard unchanged scope");
assert(!read("app/(dashboard)/hr/page.tsx").includes("PageShell"), "HR module not migrated");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
