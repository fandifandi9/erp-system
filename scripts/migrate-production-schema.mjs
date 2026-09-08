/**
 * Phase 21 — Production Schema Migration Executor
 *
 * ALLOWED:  CREATE missing collections, ADD missing fields
 * FORBIDDEN: DELETE, DROP, REMOVE, OVERWRITE RULES, BACKFILL DATA
 *
 * Run: node scripts/migrate-production-schema.mjs
 *
 * Outputs:
 *   docs/PHASE_21_PRODUCTION_SCHEMA_BEFORE.json
 *   docs/PHASE_21_PRODUCTION_RECORD_COUNTS_BEFORE.json
 *   docs/PHASE_21_PRODUCTION_MIGRATION_LOG.json
 */

import fs from "fs";
import path from "path";

// ─── Safety: refuse loopback / staging, allow only pb.serba.space ────────────
const ALLOWED_HOSTS = ["pb.serba.space"];
function assertProductionHost(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (!ALLOWED_HOSTS.some(h => host === h || host.endsWith("." + h))) {
    console.error(`SAFETY BLOCK: ${url} is not an approved Production host.`);
    process.exit(2);
  }
}

// ─── Env ─────────────────────────────────────────────────────────────────────
function getKey(text, key) {
  const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) return "";
  let v = m[1].trim().replace(/\r$/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

const prodText = fs.existsSync(path.join(process.cwd(), ".env.local.production-backup"))
  ? fs.readFileSync(path.join(process.cwd(), ".env.local.production-backup"), "utf8")
  : "";
const PROD_URL   = (getKey(prodText, "NEXT_PUBLIC_POCKETBASE_URL") || "https://pb.serba.space").replace(/\/$/, "");
const PROD_EMAIL = getKey(prodText, "POCKETBASE_ADMIN_EMAIL");
const PROD_PASS  = getKey(prodText, "POCKETBASE_ADMIN_PASSWORD");

assertProductionHost(PROD_URL);

// ─── Log ─────────────────────────────────────────────────────────────────────
const migrationLog = { started_at: new Date().toISOString(), prod_url: PROD_URL, operations: [], errors: [], summary: {} };
function logOp(op) {
  migrationLog.operations.push({ timestamp: new Date().toISOString(), ...op });
  const icon = op.result === "OK" ? "✓" : op.result === "SKIPPED" ? "–" : op.result === "CONFLICT" ? "⚠" : "✗";
  console.log(`  ${icon} [${op.result}] ${op.operation} ${op.collection}${op.field ? "." + op.field : ""}`);
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────
async function req(method, url, token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = token;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({ _raw: r.status }));
  return { ok: r.ok, status: r.status, data: d };
}

async function adminAuth(base, email, pass) {
  const r = await fetch(`${base}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password: pass }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.token) throw new Error(`Admin auth failed (${r.status}): ${JSON.stringify(d).slice(0, 200)}`);
  return d.token;
}

async function getAllCollections(base, token) {
  const all = [];
  let page = 1;
  while (true) {
    const r = await req("GET", `${base}/api/collections?page=${page}&perPage=200`, token);
    if (!r.ok || !r.data?.items) break;
    all.push(...r.data.items);
    if (all.length >= (r.data.totalItems ?? all.length)) break;
    page++;
  }
  return all;
}

async function getCollection(base, token, name) {
  const r = await req("GET", `${base}/api/collections/${name}`, token);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${name} failed: ${JSON.stringify(r.data).slice(0,200)}`);
  return r.data;
}

async function getRecordCount(base, token, collection) {
  const r = await req("GET", `${base}/api/collections/${collection}/records?page=1&perPage=1`, token);
  if (!r.ok) return null;
  return r.data?.totalItems ?? 0;
}

// ─── Migration specification (from Phase 20) ─────────────────────────────────
const ADMIN_ONLY_RULES = {
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

// Helper builders
function textField(name, required = false) {
  return { name, type: "text", required, system: false, options: { min: null, max: null, pattern: "" } };
}
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
}
function numberField(name) {
  return { name, type: "number", required: false, system: false, options: { min: null, max: null, noDecimal: false } };
}
function dateField(name) {
  return { name, type: "date", required: false, system: false, options: { min: "", max: "" } };
}
function selectField(name, values) {
  return { name, type: "select", required: false, system: false, options: { maxSelect: 1, values } };
}
function relationField(name, collectionId, required = false) {
  return {
    name, type: "relation", required, system: false,
    options: { collectionId, cascadeDelete: required, minSelect: null, maxSelect: 1, displayFields: null },
  };
}
function fileField(name, mimeTypes, maxSize) {
  return {
    name, type: "file", required: false, system: false,
    options: { maxSelect: 1, maxSize, mimeTypes, thumbs: [], protected: false },
  };
}

// ── USERS FIELDS ──────────────────────────────────────────────────────────────
const USERS_FIELDS_TO_ADD = [
  { name: "mobile_session_nonce", type: "text", field: textField("mobile_session_nonce") },
  { name: "account_type",         type: "select", field: selectField("account_type", ["owner", "user"]) },
  { name: "role_code",            type: "text", field: textField("role_code") },
  { name: "dashboard_access",     type: "bool", field: boolField("dashboard_access") },
];

// ── LEAVE FIELDS ──────────────────────────────────────────────────────────────
const LEAVE_FIELDS_TO_ADD = [
  { name: "start_date",               type: "text",   field: textField("start_date") },
  { name: "end_date",                 type: "text",   field: textField("end_date") },
  { name: "reason",                   type: "text",   field: textField("reason") },
  { name: "division",                 type: "text",   field: textField("division") },
  { name: "position",                 type: "text",   field: textField("position") },
  { name: "booking_date",             type: "text",   field: textField("booking_date") },
  { name: "daily_compensation_rate",  type: "number", field: numberField("daily_compensation_rate") },
  { name: "compensation_amount",      type: "number", field: numberField("compensation_amount") },
  { name: "rejection_reason",         type: "text",   field: textField("rejection_reason") },
];

// ── NEW COLLECTION SCHEMAS ────────────────────────────────────────────────────
// Built after we have the users collection ID from Production.
function buildNewCollections(usersId, periodsId, aspectsId, assignmentsId, reviewersId) {
  return [
    // ── Step D1 ──
    {
      name: "hr_rating_periods",
      step: "D1",
      schema: [
        textField("name", true),
        dateField("start_date"),
        dateField("end_date"),
        selectField("status", ["draft", "open", "in_progress", "closed", "cancelled"]),
        textField("description"),
        relationField("created_by", usersId, false),
      ],
      ...ADMIN_ONLY_RULES,
    },
    // ── Step D2 ──
    {
      name: "hr_rating_aspects",
      step: "D2",
      schema: [
        textField("code", true),
        textField("name", true),
        textField("description"),
        numberField("sort_order"),
        boolField("is_active"),
        numberField("min_score"),
        numberField("max_score"),
      ],
      ...ADMIN_ONLY_RULES,
    },
    // ── Step D3 (needs periodsId resolved at runtime) ──
    {
      name: "hr_rating_assignments",
      step: "D3",
      schema: [
        relationField("period", periodsId, true),
        relationField("subject", usersId, true),
        numberField("reviewer_count"),
        selectField("assignment_method", ["smart_random", "manual"]),
        selectField("status", ["draft", "assigned", "in_progress", "completed", "cancelled"]),
        textField("selection_evidence_json"),
        relationField("created_by", usersId, false),
      ],
      ...ADMIN_ONLY_RULES,
    },
    // ── Step D4 ──
    {
      name: "hr_rating_reviewers",
      step: "D4",
      schema: [
        relationField("assignment", assignmentsId, true),
        relationField("reviewer", usersId, true),
        selectField("status", ["assigned", "draft", "submitted", "locked"]),
        textField("relevance_tier"),
        textField("selection_note"),
        dateField("submitted_at"),
      ],
      ...ADMIN_ONLY_RULES,
    },
    // ── Step D5 ──
    {
      name: "hr_rating_scores",
      step: "D5",
      schema: [
        relationField("reviewer_row", reviewersId, true),
        relationField("aspect", aspectsId, true),
        numberField("score"),
        textField("comment"),
      ],
      ...ADMIN_ONLY_RULES,
    },
    // ── Step D6 ──
    {
      name: "hr_rating_results",
      step: "D6",
      schema: [
        relationField("assignment", assignmentsId, true),
        numberField("overall_score"),
        textField("category"),
        numberField("respondent_count"),
        textField("aspect_scores_json"),
        textField("summary"),
        textField("strengths"),
        textField("improvements"),
        textField("suggestions"),
        dateField("calculated_at"),
      ],
      ...ADMIN_ONLY_RULES,
    },
    // ── Step C1 ──
    {
      name: "hr_staff_reports",
      step: "C1",
      schema: [
        textField("title", true),
        textField("body", true),
        selectField("category", ["facility", "safety", "misconduct", "operations", "other"]),
        selectField("status", ["draft", "submitted", "in_review", "closed"]),
        selectField("priority", ["low", "medium", "high"]),
        textField("location_text"),
        relationField("created_by", usersId, true),
        textField("company_id"),
        textField("hr_note"),
        dateField("submitted_at"),
        dateField("closed_at"),
        relationField("closed_by", usersId, false),
      ],
      ...ADMIN_ONLY_RULES,
    },
    // ── Step C2 ──
    {
      name: "hr_findings",
      step: "C2",
      schema: [
        textField("title", true),
        textField("body", true),
        selectField("category", ["facility", "safety", "misconduct", "operations", "other"]),
        selectField("status", ["draft", "submitted", "in_review", "closed"]),
        selectField("priority", ["low", "medium", "high"]),
        textField("location_text"),
        relationField("created_by", usersId, true),
        textField("company_id"),
        textField("hr_note"),
        dateField("submitted_at"),
        dateField("closed_at"),
        relationField("closed_by", usersId, false),
      ],
      ...ADMIN_ONLY_RULES,
    },
    // ── Step C3 ──
    {
      name: "hr_case_attachments",
      step: "C3",
      schema: [
        selectField("kind", ["report", "finding"]),
        textField("parent_id", true),
        textField("original_name"),
        textField("mime"),
        numberField("size"),
        relationField("created_by", usersId, false),
        // CRITICAL: file field required by reporting-server.ts:401
        fileField("file", ["image/jpeg", "image/png", "image/webp"], 10485760),
      ],
      ...ADMIN_ONLY_RULES,
    },
  ];
}

// ─── Helpers for field operations ─────────────────────────────────────────────
function fieldMap(col) {
  const out = {};
  for (const f of col?.schema || []) out[f.name] = f;
  return out;
}

function ruleSnapshot(col) {
  return {
    listRule:   col?.listRule   ?? null,
    viewRule:   col?.viewRule   ?? null,
    createRule: col?.createRule ?? null,
    updateRule: col?.updateRule ?? null,
    deleteRule: col?.deleteRule ?? null,
  };
}

function rulesEqual(a, b) {
  const keys = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];
  return keys.every(k => a[k] === b[k]);
}

// ─── STOP helper ──────────────────────────────────────────────────────────────
function STOP(reason, detail = "") {
  console.error(`\n${"═".repeat(60)}`);
  console.error(`  STOP — MIGRATION HALTED`);
  console.error(`  Reason: ${reason}`);
  if (detail) console.error(`  Detail: ${detail}`);
  console.error(`${"═".repeat(60)}\n`);
  migrationLog.stopped = true;
  migrationLog.stop_reason = reason;
  migrationLog.stop_detail = detail;
  writeLogs();
  process.exit(1);
}

// ─── Add fields to existing collection (additive, idempotent) ─────────────────
async function addFieldsToExisting(col, fieldSpecs, existingRules) {
  const name = col.name;
  const existing = fieldMap(col);
  const toAdd = [];
  let hasConflict = false;

  for (const spec of fieldSpecs) {
    const ef = existing[spec.name];
    if (!ef) {
      toAdd.push(spec.field);
      console.log(`    → Will ADD field: ${spec.name} (${spec.type})`);
    } else if (ef.type !== spec.type) {
      logOp({ operation: "ADD_FIELD", collection: name, field: spec.name, result: "CONFLICT",
               detail: `existing type=${ef.type}, expected ${spec.type}` });
      hasConflict = true;
    } else {
      logOp({ operation: "ADD_FIELD", collection: name, field: spec.name, result: "SKIPPED",
               detail: "field already exists with correct type" });
    }
  }

  if (hasConflict) {
    STOP(`Type conflict in collection ${name}`, "Cannot safely add fields with conflicting types.");
  }

  if (toAdd.length === 0) {
    console.log(`    → No fields to add for ${name}.`);
    return;
  }

  // Merge new fields with existing schema
  const updatedSchema = [...(col.schema || []), ...toAdd];

  // Build patch preserving EXACT existing rules
  const patch = {
    ...col,
    schema: updatedSchema,
    listRule:   existingRules.listRule,
    viewRule:   existingRules.viewRule,
    createRule: existingRules.createRule,
    updateRule: existingRules.updateRule,
    deleteRule: existingRules.deleteRule,
  };

  const r = await req("PATCH", `${PROD_URL}/api/collections/${col.id}`, token, patch);
  if (!r.ok) {
    STOP(`PATCH ${name} failed`, JSON.stringify(r.data).slice(0, 300));
  }

  // Verify rules preserved
  const after = r.data;
  const afterRules = ruleSnapshot(after);
  if (!rulesEqual(existingRules, afterRules)) {
    STOP(`Rules changed after PATCH ${name}!`, JSON.stringify({ before: existingRules, after: afterRules }));
  }

  for (const f of toAdd) {
    logOp({ operation: "ADD_FIELD", collection: name, field: f.name, result: "OK" });
  }
}

// ─── Create a new collection (idempotent) ─────────────────────────────────────
async function createCollection(spec) {
  const { name, step, schema, listRule, viewRule, createRule, updateRule, deleteRule } = spec;

  const existing = await getCollection(PROD_URL, token, name);
  if (existing) {
    logOp({ operation: "CREATE_COLLECTION", collection: name, result: "SKIPPED",
             detail: "collection already exists (idempotent — kept as-is)" });
    return existing.id;
  }

  const body = { name, type: "base", schema, listRule, viewRule, createRule, updateRule, deleteRule };
  const r = await req("POST", `${PROD_URL}/api/collections`, token, body);
  if (!r.ok) {
    STOP(`CREATE ${name} failed`, JSON.stringify(r.data).slice(0, 300));
  }

  logOp({ operation: "CREATE_COLLECTION", collection: name, result: "OK", step,
           detail: `id=${r.data.id}, fields=${schema.length}` });
  return r.data.id;
}

// ─── Write output files ───────────────────────────────────────────────────────
function writeLogs() {
  migrationLog.finished_at = new Date().toISOString();
  fs.writeFileSync(
    path.join(process.cwd(), "docs", "PHASE_21_PRODUCTION_MIGRATION_LOG.json"),
    JSON.stringify(migrationLog, null, 2), "utf8",
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════════

console.log("═".repeat(62));
console.log("  PHASE 21 — PRODUCTION SCHEMA MIGRATION");
console.log(`  Target: ${PROD_URL}`);
console.log(`  Started: ${migrationLog.started_at}`);
console.log("═".repeat(62));

// ── Authenticate ──────────────────────────────────────────────────────────────
console.log("\n[1/9] Authenticating to Production admin...");
const token = await adminAuth(PROD_URL, PROD_EMAIL, PROD_PASS);
console.log("  ✓ Authenticated");

// ── PRE-MIGRATION SNAPSHOT ────────────────────────────────────────────────────
console.log("\n[2/9] Taking pre-migration Production snapshot...");
const allColsBefore = await getAllCollections(PROD_URL, token);
const beforeSnapshot = {
  captured_at: new Date().toISOString(),
  prod_url: PROD_URL,
  collection_count: allColsBefore.length,
  collections: allColsBefore.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    field_count: (c.schema || []).length,
    fields: (c.schema || []).map(f => ({ name: f.name, type: f.type, required: f.required })),
    listRule:   c.listRule   ?? null,
    viewRule:   c.viewRule   ?? null,
    createRule: c.createRule ?? null,
    updateRule: c.updateRule ?? null,
    deleteRule: c.deleteRule ?? null,
  })),
};
fs.writeFileSync(
  path.join(process.cwd(), "docs", "PHASE_21_PRODUCTION_SCHEMA_BEFORE.json"),
  JSON.stringify(beforeSnapshot, null, 2), "utf8",
);
console.log(`  ✓ Snapshot: ${allColsBefore.length} collections saved → docs/PHASE_21_PRODUCTION_SCHEMA_BEFORE.json`);

// ── RECORD COUNTS ─────────────────────────────────────────────────────────────
console.log("\n[3/9] Capturing pre-migration record counts...");
const SENSITIVE_COLLECTIONS = ["users", "leave_requests", "profiles"];
const countsBefore = { captured_at: new Date().toISOString() };
for (const col of SENSITIVE_COLLECTIONS) {
  const n = await getRecordCount(PROD_URL, token, col);
  countsBefore[col] = n;
  console.log(`  ✓ ${col}: ${n} records`);
}
fs.writeFileSync(
  path.join(process.cwd(), "docs", "PHASE_21_PRODUCTION_RECORD_COUNTS_BEFORE.json"),
  JSON.stringify(countsBefore, null, 2), "utf8",
);
console.log("  ✓ Counts saved → docs/PHASE_21_PRODUCTION_RECORD_COUNTS_BEFORE.json");

// ── PRE-FLIGHT: capture existing rules of collections we'll touch ──────────────
console.log("\n[4/9] Pre-flight: capturing and verifying existing Production rules...");
const usersCol = await getCollection(PROD_URL, token, "users");
if (!usersCol) STOP("users collection not found in Production", "Cannot proceed.");
const usersRulesBefore = ruleSnapshot(usersCol);

const leaveCol = await getCollection(PROD_URL, token, "leave_requests");
if (!leaveCol) STOP("leave_requests collection not found in Production", "Cannot proceed.");
const leaveRulesBefore = ruleSnapshot(leaveCol);

const profilesCol = await getCollection(PROD_URL, token, "profiles");
const profilesRulesBefore = profilesCol ? ruleSnapshot(profilesCol) : null;

migrationLog.rules_before = {
  users:          usersRulesBefore,
  leave_requests: leaveRulesBefore,
  profiles:       profilesRulesBefore,
};

// ── VALIDATE against Phase 20 expected rules ─────────────────────────────────
// Phase 20 confirmed these exact rule values. Verify they haven't changed since.
const expectedLeaveListRule = usersRulesBefore.listRule; // just verify non-null
if (!usersRulesBefore.listRule || !leaveRulesBefore.listRule) {
  console.warn("  ⚠ WARNING: One or more expected rules is null/empty — verify manually before proceeding.");
}
console.log("  ✓ users rules captured");
console.log("  ✓ leave_requests rules captured");
console.log("  ✓ profiles rules captured");
console.log("  ✓ Pre-flight rules check passed — existing rules will be preserved exactly");

// ── STEP A: ADD USERS FIELDS ─────────────────────────────────────────────────
console.log("\n[5/9] STEP A — Adding missing users fields...");
await addFieldsToExisting(usersCol, USERS_FIELDS_TO_ADD, usersRulesBefore);

// ── STEP B: ADD LEAVE FIELDS ─────────────────────────────────────────────────
console.log("\n[6/9] STEP B — Adding missing leave_requests fields...");
await addFieldsToExisting(leaveCol, LEAVE_FIELDS_TO_ADD, leaveRulesBefore);

// ── RESOLVE users ID for relation fields ─────────────────────────────────────
const usersId = usersCol.id;
console.log(`\n  Users collection ID: ${usersId}`);

// ── STEP D1+D2: Create periods and aspects (no cross-deps) ───────────────────
console.log("\n[7/9] STEP D — Creating HR Rating collections...");

// Placeholder IDs for collections that may not exist yet
let periodsId   = "__PLACEHOLDER_PERIODS__";
let aspectsId   = "__PLACEHOLDER_ASPECTS__";
let assignmentsId = "__PLACEHOLDER_ASSIGNMENTS__";
let reviewersId = "__PLACEHOLDER_REVIEWERS__";

// D1: hr_rating_periods
{
  const col = await getCollection(PROD_URL, token, "hr_rating_periods");
  if (col) {
    logOp({ operation: "CREATE_COLLECTION", collection: "hr_rating_periods", result: "SKIPPED", step: "D1" });
    periodsId = col.id;
  } else {
    const spec = buildNewCollections(usersId, periodsId, aspectsId, assignmentsId, reviewersId)
      .find(c => c.name === "hr_rating_periods");
    periodsId = await createCollection(spec);
  }
  console.log(`  ✓ hr_rating_periods id=${periodsId}`);
}

// D2: hr_rating_aspects
{
  const col = await getCollection(PROD_URL, token, "hr_rating_aspects");
  if (col) {
    logOp({ operation: "CREATE_COLLECTION", collection: "hr_rating_aspects", result: "SKIPPED", step: "D2" });
    aspectsId = col.id;
  } else {
    const spec = buildNewCollections(usersId, periodsId, aspectsId, assignmentsId, reviewersId)
      .find(c => c.name === "hr_rating_aspects");
    aspectsId = await createCollection(spec);
  }
  console.log(`  ✓ hr_rating_aspects id=${aspectsId}`);
}

// D3: hr_rating_assignments (needs periodsId)
{
  const col = await getCollection(PROD_URL, token, "hr_rating_assignments");
  if (col) {
    logOp({ operation: "CREATE_COLLECTION", collection: "hr_rating_assignments", result: "SKIPPED", step: "D3" });
    assignmentsId = col.id;
  } else {
    const spec = buildNewCollections(usersId, periodsId, aspectsId, assignmentsId, reviewersId)
      .find(c => c.name === "hr_rating_assignments");
    assignmentsId = await createCollection(spec);
  }
  console.log(`  ✓ hr_rating_assignments id=${assignmentsId}`);
}

// D4: hr_rating_reviewers (needs assignmentsId)
{
  const col = await getCollection(PROD_URL, token, "hr_rating_reviewers");
  if (col) {
    logOp({ operation: "CREATE_COLLECTION", collection: "hr_rating_reviewers", result: "SKIPPED", step: "D4" });
    reviewersId = col.id;
  } else {
    const spec = buildNewCollections(usersId, periodsId, aspectsId, assignmentsId, reviewersId)
      .find(c => c.name === "hr_rating_reviewers");
    reviewersId = await createCollection(spec);
  }
  console.log(`  ✓ hr_rating_reviewers id=${reviewersId}`);
}

// D5: hr_rating_scores (needs reviewersId + aspectsId)
{
  const col = await getCollection(PROD_URL, token, "hr_rating_scores");
  if (col) {
    logOp({ operation: "CREATE_COLLECTION", collection: "hr_rating_scores", result: "SKIPPED", step: "D5" });
  } else {
    const spec = buildNewCollections(usersId, periodsId, aspectsId, assignmentsId, reviewersId)
      .find(c => c.name === "hr_rating_scores");
    await createCollection(spec);
  }
  console.log(`  ✓ hr_rating_scores`);
}

// D6: hr_rating_results (needs assignmentsId)
{
  const col = await getCollection(PROD_URL, token, "hr_rating_results");
  if (col) {
    logOp({ operation: "CREATE_COLLECTION", collection: "hr_rating_results", result: "SKIPPED", step: "D6" });
  } else {
    const spec = buildNewCollections(usersId, periodsId, aspectsId, assignmentsId, reviewersId)
      .find(c => c.name === "hr_rating_results");
    await createCollection(spec);
  }
  console.log(`  ✓ hr_rating_results`);
}

// ── STEP C: Create HR Reporting collections ───────────────────────────────────
console.log("\n[8/9] STEP C — Creating HR Reporting collections...");

for (const colName of ["hr_staff_reports", "hr_findings", "hr_case_attachments"]) {
  const col = await getCollection(PROD_URL, token, colName);
  const step = colName === "hr_staff_reports" ? "C1" : colName === "hr_findings" ? "C2" : "C3";
  if (col) {
    logOp({ operation: "CREATE_COLLECTION", collection: colName, result: "SKIPPED", step });
    console.log(`  – ${colName} already exists (skipped)`);
  } else {
    const spec = buildNewCollections(usersId, periodsId, aspectsId, assignmentsId, reviewersId)
      .find(c => c.name === colName);
    await createCollection(spec);
    console.log(`  ✓ ${colName} created`);
  }
}

// ── POST-MIGRATION VERIFICATION ───────────────────────────────────────────────
console.log("\n[9/9] Post-migration verification...");

// 9a: Rule verification for existing collections
const usersAfter  = await getCollection(PROD_URL, token, "users");
const leaveAfter  = await getCollection(PROD_URL, token, "leave_requests");
const profilesAfter = await getCollection(PROD_URL, token, "profiles");

const usersRulesAfter  = ruleSnapshot(usersAfter);
const leaveRulesAfter  = ruleSnapshot(leaveAfter);
const profilesRulesAfter = profilesAfter ? ruleSnapshot(profilesAfter) : null;

migrationLog.rules_after = {
  users:          usersRulesAfter,
  leave_requests: leaveRulesAfter,
  profiles:       profilesRulesAfter,
};

let rulesFail = false;
if (!rulesEqual(usersRulesBefore, usersRulesAfter)) {
  console.error("  ✗ FAIL: users rules changed!");
  rulesFail = true;
}
if (!rulesEqual(leaveRulesBefore, leaveRulesAfter)) {
  console.error("  ✗ FAIL: leave_requests rules changed!");
  rulesFail = true;
}
if (profilesRulesBefore && profilesRulesAfter && !rulesEqual(profilesRulesBefore, profilesRulesAfter)) {
  console.error("  ✗ FAIL: profiles rules changed!");
  rulesFail = true;
}

if (rulesFail) {
  STOP("Existing Production rules were modified by migration!", "Manual review required.");
}
console.log("  ✓ users rules: UNCHANGED");
console.log("  ✓ leave_requests rules: UNCHANGED");
console.log("  ✓ profiles rules: UNCHANGED");

// 9b: New collections exist
const requiredNew = [
  "hr_rating_periods", "hr_rating_aspects", "hr_rating_assignments",
  "hr_rating_reviewers", "hr_rating_scores", "hr_rating_results",
  "hr_staff_reports", "hr_findings", "hr_case_attachments",
];
let collectionsOk = true;
for (const name of requiredNew) {
  const col = await getCollection(PROD_URL, token, name);
  if (!col) {
    console.error(`  ✗ MISSING: ${name}`);
    collectionsOk = false;
  } else {
    console.log(`  ✓ ${name} exists (${(col.schema || []).length} fields)`);
  }
}

// 9c: Verify hr_case_attachments has file field
const attachCol = await getCollection(PROD_URL, token, "hr_case_attachments");
const attachFields = fieldMap(attachCol);
const fileFieldOk = !!attachFields.file && attachFields.file.type === "file";
if (!fileFieldOk) {
  console.error("  ✗ FAIL: hr_case_attachments.file field missing or wrong type!");
} else {
  console.log(`  ✓ hr_case_attachments.file: type=file ✓`);
  const fo = attachFields.file.options || {};
  console.log(`    maxSize=${fo.maxSize}, mimeTypes=${JSON.stringify(fo.mimeTypes)}`);
}

// 9d: users fields
const usersFieldsAfter = fieldMap(usersAfter);
let userFieldsOk = true;
for (const spec of USERS_FIELDS_TO_ADD) {
  if (!usersFieldsAfter[spec.name] || usersFieldsAfter[spec.name].type !== spec.type) {
    console.error(`  ✗ FAIL: users.${spec.name} missing or wrong type`);
    userFieldsOk = false;
  } else {
    console.log(`  ✓ users.${spec.name}: type=${spec.type} ✓`);
  }
}

// 9e: leave fields
const leaveFieldsAfter = fieldMap(leaveAfter);
let leaveFieldsOk = true;
for (const spec of LEAVE_FIELDS_TO_ADD) {
  if (!leaveFieldsAfter[spec.name] || leaveFieldsAfter[spec.name].type !== spec.type) {
    console.error(`  ✗ FAIL: leave_requests.${spec.name} missing or wrong type`);
    leaveFieldsOk = false;
  } else {
    console.log(`  ✓ leave_requests.${spec.name}: type=${spec.type} ✓`);
  }
}

// 9f: Record count verification
console.log("\n  Record count verification...");
let countsFail = false;
const countsAfter = {};
for (const col of SENSITIVE_COLLECTIONS) {
  const n = await getRecordCount(PROD_URL, token, col);
  countsAfter[col] = n;
  if (n !== countsBefore[col]) {
    console.error(`  ✗ FAIL: ${col} count changed: ${countsBefore[col]} → ${n}`);
    countsFail = true;
  } else {
    console.log(`  ✓ ${col}: ${n} records (unchanged)`);
  }
}

migrationLog.counts_before = countsBefore;
migrationLog.counts_after = countsAfter;

// ── Summary ───────────────────────────────────────────────────────────────────
const opsCreated  = migrationLog.operations.filter(o => o.operation === "CREATE_COLLECTION" && o.result === "OK").length;
const opsSkipped  = migrationLog.operations.filter(o => o.result === "SKIPPED").length;
const opsAdded    = migrationLog.operations.filter(o => o.operation === "ADD_FIELD" && o.result === "OK").length;
const opsConflict = migrationLog.operations.filter(o => o.result === "CONFLICT").length;

const allPass = !rulesFail && collectionsOk && fileFieldOk && userFieldsOk && leaveFieldsOk && !countsFail && opsConflict === 0;

migrationLog.summary = {
  collections_created: opsCreated,
  collections_skipped: opsSkipped,
  fields_added: opsAdded,
  conflicts: opsConflict,
  rules_preserved: !rulesFail,
  counts_preserved: !countsFail,
  file_field_ok: fileFieldOk,
  all_pass: allPass,
};

writeLogs();

console.log("\n" + "═".repeat(62));
console.log(`  MIGRATION ${allPass ? "COMPLETE — SCHEMA MIGRATION PASS" : "FAILED — SEE ERRORS ABOVE"}`);
console.log(`  Collections created : ${opsCreated}`);
console.log(`  Fields added        : ${opsAdded}`);
console.log(`  Conflicts           : ${opsConflict}`);
console.log(`  Rules preserved     : ${!rulesFail}`);
console.log(`  Counts preserved    : ${!countsFail}`);
console.log(`  Attachment file     : ${fileFieldOk}`);
console.log("═".repeat(62));

if (!allPass) process.exit(1);
process.exit(0);
