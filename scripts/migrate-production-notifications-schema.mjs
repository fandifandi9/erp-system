/**
 * Phase 26A — Apply notifications + push_tokens to PRODUCTION PocketBase ONLY.
 *
 * ALLOWED:
 *   - GET schema / counts
 *   - POST create notifications (if absent)
 *   - POST create push_tokens (if absent)
 *
 * FORBIDDEN:
 *   - PATCH / PUT / DELETE any collection
 *   - Modify existing collections, fields, rules, or data
 *   - Staging / local hosts
 *
 * Idempotent: if collection exists → SKIP (no overwrite).
 *
 * Run: node scripts/migrate-production-notifications-schema.mjs
 */

import fs from "fs";
import path from "path";

const ALLOWED_HOSTS = ["pb.serba.space"];
const TARGET_COLLECTIONS = new Set(["notifications", "push_tokens"]);
const BLOCKED_METHODS = new Set(["PATCH", "PUT", "DELETE"]);

function getKey(text, key) {
  const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) return "";
  let v = m[1].trim().replace(/\r$/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

const prodText = fs.existsSync(path.join(process.cwd(), ".env.local.production-backup"))
  ? fs.readFileSync(path.join(process.cwd(), ".env.local.production-backup"), "utf8")
  : "";
const PROD_URL = (getKey(prodText, "NEXT_PUBLIC_POCKETBASE_URL") || "https://pb.serba.space").replace(/\/$/, "");
const PROD_EMAIL = getKey(prodText, "POCKETBASE_ADMIN_EMAIL");
const PROD_PASS = getKey(prodText, "POCKETBASE_ADMIN_PASSWORD");

function assertProductionHost(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (!ALLOWED_HOSTS.some((h) => host === h)) {
    console.error(`BLOCKED — ${url} is not an approved Production host.`);
    process.exit(2);
  }
  const blocked = ["staging", "localhost", "127.0.0.1", "8090", "8092", "pb-staging"];
  for (const b of blocked) {
    if (host.includes(b) || url.includes(b)) {
      console.error(`BLOCKED — refused non-production URL: ${url}`);
      process.exit(2);
    }
  }
}

assertProductionHost(PROD_URL);

if (!PROD_EMAIL || !PROD_PASS) {
  console.error("BLOCKED — POCKETBASE_ADMIN_EMAIL/PASSWORD required in .env.local.production-backup");
  process.exit(2);
}

const migrationLog = {
  phase: "26A",
  started_at: new Date().toISOString(),
  prod_url: PROD_URL,
  operations: [],
  pre_counts: {},
  post_counts: {},
};

function logOp(op) {
  migrationLog.operations.push({ timestamp: new Date().toISOString(), ...op });
  const icon = op.result === "OK" ? "✓" : op.result === "SKIPPED" ? "–" : "✗";
  console.log(`  ${icon} [${op.result}] ${op.operation} ${op.collection || ""}${op.detail ? " — " + op.detail : ""}`);
}

/** Safety wrapper — only GET and POST /api/collections for target collections. */
async function pbReq(method, urlPath, token, body) {
  const methodU = method.toUpperCase();
  if (BLOCKED_METHODS.has(methodU)) {
    throw new Error(`SAFETY BLOCK: ${methodU} is forbidden in Phase 26A`);
  }
  const url = `${PROD_URL}${urlPath}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = token;
  const res = await fetch(url, {
    method: methodU,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 15);
}

function textField(name, required = false) {
  return {
    system: false, id: fieldId("tf"), name, type: "text", required,
    presentable: false, unique: false,
    options: { min: null, max: null, pattern: "" },
  };
}
function boolField(name) {
  return {
    system: false, id: fieldId("bf"), name, type: "bool", required: false,
    presentable: false, unique: false, options: {},
  };
}
function selectField(name, values) {
  return {
    system: false, id: fieldId("sf"), name, type: "select", required: false,
    presentable: false, unique: false,
    options: { maxSelect: 1, values },
  };
}
function relationField(name, collectionId, required = true) {
  return {
    system: false, id: fieldId("rf"), name, type: "relation", required,
    presentable: false, unique: false,
    options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
  };
}
function dateField(name) {
  return {
    system: false, id: fieldId("df"), name, type: "date", required: false,
    presentable: false, unique: false, options: { min: "", max: "" },
  };
}

const NOTIFICATIONS_RULES = {
  listRule: "@request.auth.id = recipient",
  viewRule: "@request.auth.id = recipient",
  createRule: null,
  updateRule: "@request.auth.id = recipient",
  deleteRule: null,
};

const PUSH_TOKENS_RULES = {
  listRule: "@request.auth.id = user",
  viewRule: "@request.auth.id = user",
  createRule: '@request.auth.id != ""',
  updateRule: "@request.auth.id = user",
  deleteRule: null,
};

const NOTIFICATIONS_SCHEMA_SPEC = (usersId) => [
  relationField("recipient", usersId, true),
  textField("type", true),
  textField("title"),
  textField("body"),
  textField("resource_type"),
  textField("resource_id"),
  textField("action"),
  dateField("read_at"),
  textField("idempotency_key"),
];

const PUSH_TOKENS_SCHEMA_SPEC = (usersId) => [
  relationField("user", usersId, true),
  textField("token", true),
  selectField("platform", ["android", "ios"]),
  textField("device_id"),
  boolField("is_active"),
  dateField("last_seen"),
];

async function getCount(token, col) {
  const r = await pbReq("GET", `/api/collections/${col}/records?page=1&perPage=1`, token);
  if (r.status === 404) return null;
  return r.data?.totalItems ?? null;
}

async function getCollection(token, name) {
  const r = await pbReq("GET", `/api/collections/${name}`, token);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${name} failed: ${r.status}`);
  return r.data;
}

/** CREATE only — skip if exists. Never PATCH. */
async function createCollectionIfMissing(token, name, schema, rules) {
  if (!TARGET_COLLECTIONS.has(name)) {
    throw new Error(`SAFETY BLOCK: ${name} is not in allowed target collections`);
  }
  const existing = await getCollection(token, name);
  if (existing?.id) {
    logOp({ operation: "SKIP", collection: name, result: "SKIPPED", detail: "already exists — no overwrite" });
    return { action: "SKIPPED", id: existing.id };
  }
  const created = await pbReq("POST", "/api/collections", token, {
    name, type: "base", schema, ...rules,
  });
  if (!created.ok) {
    logOp({ operation: "CREATE", collection: name, result: "FAIL", detail: JSON.stringify(created.data).slice(0, 200) });
    throw new Error(`CREATE ${name} failed: ${JSON.stringify(created.data)}`);
  }
  logOp({ operation: "CREATE", collection: name, result: "OK", detail: `id=${created.data.id}` });
  return { action: "CREATED", id: created.data.id };
}

function verifySchema(col, name, expectedRules, requiredFields) {
  const fails = [];
  for (const [k, v] of Object.entries(expectedRules)) {
    if (col[k] !== v) fails.push(`${name}.${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(col[k])}`);
  }
  const fieldNames = (col.schema || []).map((f) => f.name);
  for (const f of requiredFields) {
    if (!fieldNames.includes(f)) fails.push(`${name} missing field: ${f}`);
  }
  return fails;
}

async function migrate() {
  console.log("=== Phase 26A — Production Notification Schema (CREATE ONLY) ===");
  console.log("TARGET:", PROD_URL);
  console.log("Allowed collections:", [...TARGET_COLLECTIONS].join(", "));
  console.log("");

  const health = await pbReq("GET", "/api/health", null);
  if (!health.ok) throw new Error("Production PocketBase health check failed");
  console.log("✓ Production PocketBase healthy\n");

  const auth = await pbReq("POST", "/api/admins/auth-with-password", null, {
    identity: PROD_EMAIL,
    password: PROD_PASS,
  });
  if (!auth.data?.token) throw new Error("Production admin auth failed");
  const token = auth.data.token;
  console.log("✓ Production admin authenticated\n");

  // ── Pre-migration snapshot ──────────────────────────────────────────────────
  console.log("── Pre-migration snapshot ──────────────────────────────────────");
  const preCols = ["users", "profiles", "leave_requests", "notifications", "push_tokens"];
  for (const col of preCols) {
    const n = await getCount(token, col);
    migrationLog.pre_counts[col] = n;
    const exists = col === "notifications" || col === "push_tokens"
      ? (await getCollection(token, col)) !== null
      : n !== null;
    if (col === "notifications" || col === "push_tokens") {
      console.log(`  ${col}: ${exists ? "EXISTS" : "ABSENT (404)"}  records=${n ?? "N/A"}`);
    } else {
      console.log(`  ${col}: ${n}`);
    }
  }

  const usersRes = await pbReq("GET", "/api/collections/users", token);
  if (!usersRes.ok) throw new Error("Cannot read users collection");
  const USERS_ID = usersRes.data.id;
  console.log(`\n✓ users collection id: ${USERS_ID}`);

  // ── CREATE migrations ───────────────────────────────────────────────────────
  console.log("\n── Migration (CREATE only) ───────────────────────────────────");
  const notifResult = await createCollectionIfMissing(
    token, "notifications", NOTIFICATIONS_SCHEMA_SPEC(USERS_ID), NOTIFICATIONS_RULES,
  );
  const ptResult = await createCollectionIfMissing(
    token, "push_tokens", PUSH_TOKENS_SCHEMA_SPEC(USERS_ID), PUSH_TOKENS_RULES,
  );

  // ── Post-migration verification ─────────────────────────────────────────────
  console.log("\n── Post-migration verification ───────────────────────────────");
  const notif = await getCollection(token, "notifications");
  const pt = await getCollection(token, "push_tokens");
  if (!notif || !pt) throw new Error("Post-migration: collections missing");

  const requiredNotifFields = ["recipient", "type", "title", "body", "resource_type", "resource_id", "action", "read_at", "idempotency_key"];
  const requiredPtFields = ["user", "token", "platform", "device_id", "is_active", "last_seen"];

  const fails = [
    ...verifySchema(notif, "notifications", NOTIFICATIONS_RULES, requiredNotifFields),
    ...verifySchema(pt, "push_tokens", PUSH_TOKENS_RULES, requiredPtFields),
  ];

  console.log("notifications:");
  console.log(`  listRule: ${notif.listRule}`);
  console.log(`  viewRule: ${notif.viewRule}`);
  console.log(`  createRule: ${notif.createRule}`);
  console.log(`  updateRule: ${notif.updateRule}`);
  console.log(`  fields: ${notif.schema.map((f) => f.name).join(", ")}`);

  console.log("push_tokens:");
  console.log(`  listRule: ${pt.listRule}`);
  console.log(`  viewRule: ${pt.viewRule}`);
  console.log(`  createRule: ${pt.createRule}`);
  console.log(`  updateRule: ${pt.updateRule}`);
  console.log(`  fields: ${pt.schema.map((f) => f.name).join(", ")}`);

  if (fails.length > 0) {
    console.log("\n✗ VERIFICATION FAILED:");
    for (const f of fails) console.log("  -", f);
    process.exit(1);
  }
  console.log("\n✓ Schema rules and fields match Phase 24/25 specification");

  // ── Data integrity ──────────────────────────────────────────────────────────
  console.log("\n── Data integrity (post-migration) ───────────────────────────");
  for (const col of preCols) {
    const n = await getCount(token, col);
    migrationLog.post_counts[col] = n;
    const pre = migrationLog.pre_counts[col];
    const unchanged = col === "notifications" || col === "push_tokens"
      ? (pre === null && n === 0) || (pre === n)
      : pre === n;
    console.log(`  ${col}: ${n} ${unchanged ? "✓" : "✗ CHANGED"}`);
    if (!unchanged && col !== "notifications" && col !== "push_tokens") {
      fails.push(`${col} count changed: ${pre} → ${n}`);
    }
  }

  if (fails.length > 0) {
    console.log("\n✗ DATA INTEGRITY FAILED");
    process.exit(1);
  }

  migrationLog.completed_at = new Date().toISOString();
  migrationLog.summary = {
    notifications: notifResult.action,
    push_tokens: ptResult.action,
    status: "PASS",
  };

  const logPath = path.join(process.cwd(), "docs", "PHASE_26A_PRODUCTION_MIGRATION_LOG.json");
  fs.writeFileSync(logPath, JSON.stringify(migrationLog, null, 2), "utf8");
  console.log("\nMigration log:", logPath);
  console.log("\n✓ Phase 26A Production notification schema migration COMPLETE");
  console.log("  Application: UNTOUCHED");
  console.log("  Existing collections/rules/data: UNCHANGED");
}

migrate().catch((e) => {
  console.error("\nMigration FAILED:", e.message);
  process.exit(1);
});
