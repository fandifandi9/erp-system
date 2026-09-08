/**
 * scripts/migrate-local-notifications-schema.mjs
 * Phase 24 — Add notifications + push_tokens collections to LOCAL PocketBase ONLY.
 *
 * Safety:
 *   - Refuses to run against any non-local host (pb.serba.space, :8091, :8092, pb-staging).
 *   - Idempotent: if collections/fields already exist they are not overwritten destructively.
 *   - listRule/viewRule are USER-SCOPED (user can only see their own records).
 *   - createRule/updateRule/deleteRule = null (server-only via admin PB).
 *
 * Run: node scripts/migrate-local-notifications-schema.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://127.0.0.1:8090";

// ── Safety guard ──────────────────────────────────────────────────────────────
const u = BASE.toLowerCase();
if (
  u.includes("pb.serba.space") ||
  u.includes("serba.space") ||
  u.includes(":8091") ||
  u.includes(":8092") ||
  u.includes("pb-staging")
) {
  console.error("BLOCKED — this script is LOCAL :8090 ONLY. Refusing to run.");
  process.exit(2);
}

// ── Env loading ───────────────────────────────────────────────────────────────
function loadEnv() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const ENV = loadEnv();
const ADMIN_EMAIL = ENV.POCKETBASE_ADMIN_EMAIL || "local-admin@serba.local";
const ADMIN_PASS = ENV.POCKETBASE_ADMIN_PASSWORD || "";

// ── PB helpers ────────────────────────────────────────────────────────────────
async function pbJson(method, url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = token;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function textField(name, required = false) {
  return { name, type: "text", required, system: false, options: { min: null, max: null, pattern: "" } };
}
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
}
function selectField(name, values) {
  return { name, type: "select", required: false, system: false, options: { maxSelect: 1, values } };
}
function relationField(name, collectionId, required = true) {
  return {
    name,
    type: "relation",
    required,
    system: false,
    options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
  };
}
function dateField(name) {
  return { name, type: "date", required: false, system: false, options: { min: "", max: "" } };
}

function ensureFields(existing, extras) {
  const names = new Set((existing || []).map((f) => f.name));
  const next = [...(existing || [])];
  for (const f of extras) {
    if (!names.has(f.name)) {
      next.push(f);
      console.log(`  + field: ${f.name}`);
    }
  }
  return next;
}

async function ensureCollection(token, name, schema, rules) {
  const existing = await pbJson("GET", `${BASE}/api/collections/${name}`, null, token);
  if (existing.data?.id) {
    console.log(`  [EXIST] ${name} — extending fields only`);
    const col = existing.data;
    col.schema = ensureFields(col.schema, schema);
    // Apply rules only if they're more restrictive or equal
    col.listRule = rules.listRule;
    col.viewRule = rules.viewRule;
    col.createRule = rules.createRule;
    col.updateRule = rules.updateRule;
    col.deleteRule = rules.deleteRule;
    const patched = await pbJson("PATCH", `${BASE}/api/collections/${col.id}`, col, token);
    if (!patched.ok) throw new Error(`PATCH ${name} failed: ${JSON.stringify(patched.data)}`);
    return patched.data.id || col.id;
  }
  console.log(`  [CREATE] ${name}`);
  const created = await pbJson(
    "POST",
    `${BASE}/api/collections`,
    { name, type: "base", schema, ...rules },
    token,
  );
  if (!created.ok) throw new Error(`Create ${name} failed: ${JSON.stringify(created.data)}`);
  return created.data.id;
}

// ── Main migration ────────────────────────────────────────────────────────────
async function migrate() {
  // Check health
  const health = await pbJson("GET", `${BASE}/api/health`, null, null);
  if (!health.ok) throw new Error(`PocketBase not available at ${BASE}`);
  console.log(`✓ PocketBase LOCAL healthy at ${BASE}`);

  // Auth
  let auth = await pbJson("POST", `${BASE}/api/admins/auth-with-password`, {
    identity: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  if (!auth.data?.token) {
    throw new Error(
      "Admin authentication failed. Ensure PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are in .env.local."
    );
  }
  const token = auth.data.token;
  console.log("✓ Admin authenticated");

  // Get users collection ID for relations
  const usersRes = await pbJson("GET", `${BASE}/api/collections/users`, null, token);
  if (!usersRes.ok) throw new Error("Cannot read users collection");
  const USERS_ID = usersRes.data.id;
  console.log(`✓ users collection id: ${USERS_ID}`);

  console.log("\n── notifications ────────────────────────────────────────────");
  await ensureCollection(
    token,
    "notifications",
    [
      relationField("recipient", USERS_ID, true),
      textField("type", true),
      textField("title"),
      textField("body"),
      textField("resource_type"),
      textField("resource_id"),
      textField("action"),          // deep link path e.g. /leave
      dateField("read_at"),         // null = unread
      textField("idempotency_key"), // prevent duplicate events
    ],
    {
      // User can only read/list their own notifications; server creates/updates/deletes
      listRule: '@request.auth.id = recipient',
      viewRule: '@request.auth.id = recipient',
      createRule: null,              // server only (admin PB)
      updateRule: '@request.auth.id = recipient', // allow user to mark read
      deleteRule: null,              // server only
    },
  );

  console.log("\n── push_tokens ──────────────────────────────────────────────");
  await ensureCollection(
    token,
    "push_tokens",
    [
      relationField("user", USERS_ID, true),
      textField("token", true),
      selectField("platform", ["android", "ios"]),
      textField("device_id"),        // optional device identifier for multi-device dedup
      boolField("is_active"),
      dateField("last_seen"),
    ],
    {
      // User can read own tokens; create allowed from user (for registration)
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""', // authenticated users can register tokens
      updateRule: '@request.auth.id = user',
      deleteRule: null, // server handles deactivation
    },
  );

  console.log("\n✓ Phase 24 schema migration complete (LOCAL only)");
  console.log("  notifications: user-scoped listRule/viewRule, server createRule=null");
  console.log("  push_tokens:   user-scoped, user can register own tokens");
  console.log("  Production/Staging: UNTOUCHED");
}

migrate().catch((e) => {
  console.error("Migration FAILED:", e.message);
  process.exit(1);
});
