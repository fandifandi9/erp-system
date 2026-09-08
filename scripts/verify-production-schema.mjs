/**
 * Phase 22 — Production Pre-Deployment Verification
 * GET-ONLY. Zero writes. Zero mutations.
 */
import fs from "fs";
import path from "path";

function getKey(text, key) {
  const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) return "";
  let v = m[1].trim().replace(/\r$/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

const prodText = fs.existsSync(path.join(process.cwd(), ".env.local.production-backup"))
  ? fs.readFileSync(path.join(process.cwd(), ".env.local.production-backup"), "utf8") : "";
const PROD_URL   = (getKey(prodText, "NEXT_PUBLIC_POCKETBASE_URL") || "https://pb.serba.space").replace(/\/$/, "");
const PROD_EMAIL = getKey(prodText, "POCKETBASE_ADMIN_EMAIL");
const PROD_PASS  = getKey(prodText, "POCKETBASE_ADMIN_PASSWORD");

async function adminAuth(base, email, pass) {
  const r = await fetch(`${base}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password: pass }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.token) throw new Error(`Auth failed (${r.status})`);
  return d.token;
}

async function getCol(base, token, name) {
  const r = await fetch(`${base}/api/collections/${name}`, { headers: { Authorization: token } });
  if (r.status === 404) return null;
  return r.json().catch(() => null);
}

async function getCount(base, token, col) {
  const r = await fetch(`${base}/api/collections/${col}/records?page=1&perPage=1`, { headers: { Authorization: token } });
  const d = await r.json().catch(() => ({}));
  return d.totalItems ?? null;
}

const report = { verified_at: new Date().toISOString(), prod_url: PROD_URL, checks: [], collections: {} };
let PASS = true;

function check(label, ok, detail = "") {
  const status = ok ? "PASS" : "FAIL";
  report.checks.push({ label, status, detail });
  const icon = ok ? "✓" : "✗";
  if (!ok) PASS = false;
  console.log(`  ${icon} [${status}] ${label}${detail ? " — " + detail : ""}`);
}

console.log("═".repeat(62));
console.log("  PHASE 22 — PRODUCTION SCHEMA VERIFICATION (GET-ONLY)");
console.log(`  Target: ${PROD_URL}`);
console.log(`  Time: ${report.verified_at}`);
console.log("═".repeat(62));

const token = await adminAuth(PROD_URL, PROD_EMAIL, PROD_PASS);
console.log("  ✓ Authenticated (GET-only verification)\n");

// ── Record counts ─────────────────────────────────────────────────────────────
console.log("[1] Record count verification (Phase 21 baseline)...");
const counts = {};
for (const [col, expected] of [["users", 23], ["leave_requests", 34], ["profiles", 23]]) {
  const n = await getCount(PROD_URL, token, col);
  counts[col] = n;
  check(`${col} count = ${expected}`, n === expected, `actual: ${n}`);
}
report.record_counts = counts;

// ── New collections ───────────────────────────────────────────────────────────
console.log("\n[2] New collection existence...");
const NEW_COLS = [
  "hr_rating_periods","hr_rating_aspects","hr_rating_assignments",
  "hr_rating_reviewers","hr_rating_scores","hr_rating_results",
  "hr_staff_reports","hr_findings","hr_case_attachments",
];
for (const name of NEW_COLS) {
  const col = await getCol(PROD_URL, token, name);
  report.collections[name] = col ? { exists: true, fields: (col.schema||[]).map(f=>({name:f.name,type:f.type})), rules:{listRule:col.listRule,viewRule:col.viewRule,createRule:col.createRule,updateRule:col.updateRule,deleteRule:col.deleteRule} } : { exists: false };
  check(`${name} exists`, !!col, col ? `${(col.schema||[]).length} fields` : "MISSING");
}

// ── New collections: all rules must be null ───────────────────────────────────
console.log("\n[3] New collection rules (admin-only = all null)...");
for (const name of NEW_COLS) {
  const col = await getCol(PROD_URL, token, name);
  if (!col) { check(`${name} rules`, false, "collection missing"); continue; }
  const allNull = [col.listRule, col.viewRule, col.createRule, col.updateRule, col.deleteRule].every(r => r === null);
  check(`${name} rules all null`, allNull, allNull ? "✓" : `non-null rules detected`);
}

// ── hr_case_attachments file field ───────────────────────────────────────────
console.log("\n[4] hr_case_attachments.file field verification...");
const attachCol = await getCol(PROD_URL, token, "hr_case_attachments");
const fileField = attachCol?.schema?.find(f => f.name === "file");
check("hr_case_attachments.file exists", !!fileField, fileField ? `type=${fileField.type}` : "MISSING");
if (fileField) {
  check("hr_case_attachments.file type=file", fileField.type === "file", `actual: ${fileField.type}`);
  const opts = fileField.options || {};
  check("hr_case_attachments.file maxSize=10485760", opts.maxSize === 10485760, `actual: ${opts.maxSize}`);
  const mimes = opts.mimeTypes || [];
  check("hr_case_attachments.file mimeTypes includes image/jpeg", mimes.includes("image/jpeg"));
  check("hr_case_attachments.file mimeTypes includes image/png", mimes.includes("image/png"));
  check("hr_case_attachments.file mimeTypes includes image/webp", mimes.includes("image/webp"));
}

// ── users fields ─────────────────────────────────────────────────────────────
console.log("\n[5] users collection new fields...");
const usersCol = await getCol(PROD_URL, token, "users");
report.collections.users = { rules: { listRule:usersCol?.listRule, viewRule:usersCol?.viewRule, createRule:usersCol?.createRule, updateRule:usersCol?.updateRule, deleteRule:usersCol?.deleteRule }, fields: (usersCol?.schema||[]).map(f=>({name:f.name,type:f.type})) };
const USERS_NEW = [["mobile_session_nonce","text"],["account_type","select"],["role_code","text"],["dashboard_access","bool"]];
for (const [name, type] of USERS_NEW) {
  const f = usersCol?.schema?.find(f => f.name === name);
  check(`users.${name} (${type})`, !!f && f.type === type, f ? `type=${f.type}` : "MISSING");
}

// ── leave_requests fields ─────────────────────────────────────────────────────
console.log("\n[6] leave_requests collection new fields...");
const leaveCol = await getCol(PROD_URL, token, "leave_requests");
report.collections.leave_requests = { rules: { listRule:leaveCol?.listRule, viewRule:leaveCol?.viewRule, createRule:leaveCol?.createRule, updateRule:leaveCol?.updateRule, deleteRule:leaveCol?.deleteRule }, fields: (leaveCol?.schema||[]).map(f=>({name:f.name,type:f.type})) };
const LEAVE_NEW = [
  ["start_date","text"],["end_date","text"],["reason","text"],
  ["division","text"],["position","text"],["booking_date","text"],
  ["daily_compensation_rate","number"],["compensation_amount","number"],["rejection_reason","text"],
];
for (const [name, type] of LEAVE_NEW) {
  const f = leaveCol?.schema?.find(f => f.name === name);
  check(`leave_requests.${name} (${type})`, !!f && f.type === type, f ? `type=${f.type}` : "MISSING");
}

// ── Existing rules verification (compare vs before snapshot) ──────────────────
console.log("\n[7] Existing rules vs Phase 21 pre-migration snapshot...");
const beforeSnap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs", "PHASE_21_PRODUCTION_SCHEMA_BEFORE.json"), "utf8"));
function ruleSnap(col) { return { listRule:col?.listRule??null, viewRule:col?.viewRule??null, createRule:col?.createRule??null, updateRule:col?.updateRule??null, deleteRule:col?.deleteRule??null }; }
function rulesEq(a,b) { return ["listRule","viewRule","createRule","updateRule","deleteRule"].every(k=>a[k]===b[k]); }

for (const colName of ["users","profiles","leave_requests"]) {
  const snap = beforeSnap.collections.find(c => c.name === colName);
  const live = await getCol(PROD_URL, token, colName);
  if (!snap || !live) { check(`${colName} rules vs snapshot`, false, "cannot compare"); continue; }
  const snapRules = { listRule:snap.listRule??null, viewRule:snap.viewRule??null, createRule:snap.createRule??null, updateRule:snap.updateRule??null, deleteRule:snap.deleteRule??null };
  const liveRules = ruleSnap(live);
  check(`${colName} rules identical to Phase 21 snapshot`, rulesEq(snapRules, liveRules));
}

// ── hr_rating_periods fields spec check ──────────────────────────────────────
console.log("\n[8] Spot-check HR Rating fields structure...");
const periodsCol = await getCol(PROD_URL, token, "hr_rating_periods");
const periodsFields = periodsCol?.schema?.map(f=>f.name) || [];
for (const f of ["name","start_date","end_date","status","description","created_by"]) {
  check(`hr_rating_periods.${f} exists`, periodsFields.includes(f));
}
const assignCol = await getCol(PROD_URL, token, "hr_rating_assignments");
for (const f of ["period","subject","reviewer_count","assignment_method","status","created_by"]) {
  check(`hr_rating_assignments.${f} exists`, (assignCol?.schema?.map(s=>s.name)||[]).includes(f));
}
const scoresCol = await getCol(PROD_URL, token, "hr_rating_scores");
for (const f of ["reviewer_row","aspect","score","comment"]) {
  check(`hr_rating_scores.${f} exists`, (scoresCol?.schema?.map(s=>s.name)||[]).includes(f));
}
const resultsCol = await getCol(PROD_URL, token, "hr_rating_results");
for (const f of ["assignment","overall_score","category","respondent_count","aspect_scores_json","calculated_at"]) {
  check(`hr_rating_results.${f} exists`, (resultsCol?.schema?.map(s=>s.name)||[]).includes(f));
}

// ── hr_staff_reports + hr_findings fields ────────────────────────────────────
console.log("\n[9] Spot-check HR Reporting fields structure...");
const reportsCol = await getCol(PROD_URL, token, "hr_staff_reports");
for (const f of ["title","body","category","status","priority","created_by","submitted_at","hr_note"]) {
  check(`hr_staff_reports.${f} exists`, (reportsCol?.schema?.map(s=>s.name)||[]).includes(f));
}
const findingsCol = await getCol(PROD_URL, token, "hr_findings");
for (const f of ["title","body","category","status","priority","created_by","submitted_at","hr_note"]) {
  check(`hr_findings.${f} exists`, (findingsCol?.schema?.map(s=>s.name)||[]).includes(f));
}
const attachFields = attachCol?.schema?.map(s=>s.name)||[];
for (const f of ["kind","parent_id","original_name","mime","size","created_by","file"]) {
  check(`hr_case_attachments.${f} exists`, attachFields.includes(f));
}

// ── Summary ───────────────────────────────────────────────────────────────────
report.overall = PASS ? "PASS" : "FAIL";
report.total_checks = report.checks.length;
report.failed_checks = report.checks.filter(c=>c.status==="FAIL").length;

fs.writeFileSync(
  path.join(process.cwd(), "docs", "_phase22_production_verify.json"),
  JSON.stringify(report, null, 2), "utf8",
);

console.log("\n" + "═".repeat(62));
console.log(`  Production Verification: ${PASS ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  Total checks: ${report.total_checks}, Failed: ${report.failed_checks}`);
console.log("═".repeat(62));

process.exit(PASS ? 0 : 1);
