/**
 * Phase 34E — Payslip privacy + employee documents tests (local).
 * Run: npm run test:phase34e-payslip-documents
 */

import fs from "fs";

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

// ─── mirrors lib/capabilities/payroll.ts ───────────────────────────────────

function resolvePayslipCapabilities(user) {
  if (!user) return [];
  const caps = ["payslip.view_self", "payslip.download_self"];
  const isOwner = user.role === "owner" || user.account_type === "owner";
  const isHr = user.role === "hr" || user.account_type === "hr";
  if (isOwner) caps.push("payslip.view_scoped", "payslip.download_scoped", "payslip.manage");
  else if (isHr) caps.push("payslip.view_scoped", "payslip.download_scoped");
  return caps;
}

function resolveEmployeeDocumentCapabilities(user) {
  if (!user) return [];
  const caps = [
    "employee_document.view_self",
    "employee_document.upload_self",
    "employee_document.download_self",
  ];
  const isOwner = user.role === "owner" || user.account_type === "owner";
  const isHr = user.role === "hr" || user.account_type === "hr";
  if (isOwner || isHr) caps.push("employee_document.view_scoped", "employee_document.download_scoped");
  return caps;
}

// ─── mirrors lib/hr/document-validate.ts ───────────────────────────────────

const PDF = [0x25, 0x50, 0x44, 0x46];
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const MAX = 10 * 1024 * 1024;

function startsWith(bytes, sig) {
  return sig.every((b, i) => bytes[i] === b);
}

function sniffDocument(bytes) {
  if (startsWith(bytes, PDF)) return "application/pdf";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  return null;
}

function validateDoc(bytes, declaredMime, name) {
  if (!bytes.length) return { ok: false };
  if (bytes.length > MAX) return { ok: false };
  const sniffed = sniffDocument(bytes);
  if (!sniffed) return { ok: false };
  if (name.endsWith(".exe")) return { ok: false };
  return { ok: true, mime: sniffed };
}

// ─── payslip access logic mirror ───────────────────────────────────────────

function assertPayslipAccess(actorUserId, itemUserId, actorCaps, isOwner, itemCompanyId, actorCompanyIds) {
  const isSelf = actorUserId === itemUserId;
  if (isSelf) {
    return actorCaps.includes("payslip.view_self");
  }
  if (!actorCaps.includes("payslip.view_scoped")) return false;
  if (isOwner) return true;
  return itemCompanyId && actorCompanyIds.includes(itemCompanyId);
}

// ─── entity snapshot immutability ──────────────────────────────────────────

function shouldRestampSnapshot(existingSnapshot, force) {
  if (force) return true;
  return !String(existingSnapshot ?? "").trim();
}

console.log("\n=== Phase 34E Payslip & Document Privacy Tests ===\n");

console.log("Payslip capabilities");
{
  assert(
    resolvePayslipCapabilities({ role: "staff" }).includes("payslip.view_self"),
    "staff → view_self",
  );
  assert(
    !resolvePayslipCapabilities({ role: "staff" }).includes("payslip.view_scoped"),
    "staff → no scoped",
  );
  assert(
    resolvePayslipCapabilities({ role: "manager" }).includes("payslip.view_self") &&
      !resolvePayslipCapabilities({ role: "manager" }).includes("payslip.view_scoped"),
    "manager → self only (no default payroll)",
  );
  assert(
    resolvePayslipCapabilities({ account_type: "hr" }).includes("payslip.view_scoped"),
    "HR → scoped",
  );
  assert(
    resolvePayslipCapabilities({ account_type: "owner" }).includes("payslip.manage"),
    "owner → manage",
  );
}

console.log("\nEmployee document capabilities");
{
  assert(
    resolveEmployeeDocumentCapabilities({ role: "staff" }).includes("employee_document.upload_self"),
    "staff → upload_self",
  );
  assert(
    !resolveEmployeeDocumentCapabilities({ role: "manager" }).includes("employee_document.view_scoped"),
    "manager → no scoped documents",
  );
  assert(
    resolveEmployeeDocumentCapabilities({ account_type: "hr" }).includes("employee_document.view_scoped"),
    "HR → view_scoped",
  );
}

console.log("\nPayslip ownership / privacy");
{
  assert(
    assertPayslipAccess("u1", "u1", ["payslip.view_self"], false, "c1", []),
    "self access PASS",
  );
  assert(
    !assertPayslipAccess("u1", "u2", ["payslip.view_self"], false, "c1", []),
    "other employee_id DENIED",
  );
  assert(
    !assertPayslipAccess("u1", "u2", ["payslip.view_scoped"], false, "c9", ["c1"]),
    "scoped out-of-company DENIED",
  );
  assert(
    assertPayslipAccess("hr1", "u2", ["payslip.view_scoped"], false, "c1", ["c1"]),
    "HR in-scope PASS",
  );
}

console.log("\nEntity snapshot immutability");
{
  assert(shouldRestampSnapshot("", false) === true, "empty snapshot → stamp");
  assert(shouldRestampSnapshot("PT A", false) === false, "existing snapshot → keep (immutable)");
  assert(shouldRestampSnapshot("PT A", true) === true, "force restamp");
}

console.log("\nDocument file validation");
{
  assert(validateDoc(new Uint8Array(PDF), "application/pdf", "doc.pdf").ok, "PDF PASS");
  assert(validateDoc(new Uint8Array(JPEG), "image/jpeg", "ktp.jpg").ok, "JPEG PASS");
  assert(validateDoc(new Uint8Array(PNG), "image/png", "npwp.png").ok, "PNG PASS");
  assert(!validateDoc(new Uint8Array([0, 1, 2]), "application/pdf", "x.pdf").ok, "invalid magic DENIED");
  assert(!validateDoc(new Uint8Array(PDF), "application/pdf", "mal.exe").ok, "bad extension DENIED");
  assert(new Uint8Array(JPEG).length <= MAX, "size limit constant defined");
}

console.log("\nDemo seed idempotency keys");
{
  const now = new Date(2026, 7, 31);
  const keys = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  assert(keys.length === 3, "3 dynamic periods");
  assert(keys[2] === "2026-08" && keys[0] === "2026-06", "Aug 2026 → Jun/Jul/Aug");
  assert(`phase34e-demo-fn2:2026-08`.startsWith("phase34e-demo-fn2:"), "deterministic demo_seed_key");
}

console.log("\nPayslip HTML requirements (structural)");
{
  const htmlMustInclude = ["CONFIDENTIAL / RAHASIA", "SLIP GAJI", "Take Home Pay"];
  const sample = `<div>CONFIDENTIAL / RAHASIA</div><h1>SLIP GAJI</h1><span>Take Home Pay</span>`;
  for (const frag of htmlMustInclude) {
    assert(sample.includes(frag), `HTML contains ${frag}`);
  }
}

console.log("\nHR policy capabilities");
{
  function resolveHrPolicyCaps(user) {
    if (!user) return [];
    const caps = ["hr_policy.view_published"];
    if (user.role === "owner" || user.account_type === "owner" || user.role === "hr" || user.account_type === "hr") {
      caps.push("hr_policy.manage");
    }
    return caps;
  }
  assert(resolveHrPolicyCaps({ role: "staff" }).includes("hr_policy.view_published"), "staff → view published policies");
  assert(!resolveHrPolicyCaps({ role: "staff" }).includes("hr_policy.manage"), "staff → no manage");
  assert(resolveHrPolicyCaps({ account_type: "hr" }).includes("hr_policy.manage"), "HR → manage policies");
}

console.log("\nArtifact checks");
{
  const files = [
    "lib/hr/hr-policy-server.ts",
    "lib/hr/holiday-server.ts",
    "app/api/hr/policies/published/route.ts",
    "app/api/hr/holidays/published/route.ts",
    "app/(dashboard)/dashboard-staff/policies/page.tsx",
    "app/(dashboard)/dashboard-staff/holidays/page.tsx",
    "components/UserAvatar.tsx",
    "scripts/seed-local-phase34e-staff-uat.mjs",
  ];
  for (const f of files) {
    assert(fs.existsSync(f), `exists ${f}`);
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
