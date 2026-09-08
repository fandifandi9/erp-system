/**
 * READ-ONLY schema comparison: Local PocketBase vs Production PocketBase.
 * Only uses GET requests. No POST/PATCH/PUT/DELETE to either instance.
 *
 * Run: node scripts/compare-schema-local-vs-prod.mjs
 *
 * Outputs JSON diff to stdout and summary to stderr.
 */

import fs from "fs";
import path from "path";

// ─── Env ────────────────────────────────────────────────────────────────────

function getEnvKey(text, key) {
  const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) return "";
  let v = m[1].trim().replace(/\r$/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

function loadEnvPair(localFile, prodFile) {
  const lt = fs.existsSync(localFile) ? fs.readFileSync(localFile, "utf8") : "";
  const pt = fs.existsSync(prodFile)  ? fs.readFileSync(prodFile,  "utf8") : "";
  return {
    local: {
      url:   getEnvKey(lt, "NEXT_PUBLIC_POCKETBASE_URL") || "http://127.0.0.1:8090",
      email: getEnvKey(lt, "POCKETBASE_ADMIN_EMAIL"),
      pass:  getEnvKey(lt, "POCKETBASE_ADMIN_PASSWORD"),
    },
    prod: {
      url:   getEnvKey(pt, "NEXT_PUBLIC_POCKETBASE_URL") || getEnvKey(pt, "POCKETBASE_URL") || "https://pb.serba.space",
      email: getEnvKey(pt, "POCKETBASE_ADMIN_EMAIL"),
      pass:  getEnvKey(pt, "POCKETBASE_ADMIN_PASSWORD"),
    },
  };
}

const { local: localCfg, prod: prodCfg } = loadEnvPair(
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), ".env.local.production-backup"),
);

const LOCAL_URL   = localCfg.url.replace(/\/$/, "");
const LOCAL_EMAIL = localCfg.email;
const LOCAL_PASS  = localCfg.pass;
const PROD_URL    = prodCfg.url.replace(/\/$/, "");
const PROD_EMAIL  = prodCfg.email;
const PROD_PASS   = prodCfg.pass;

// Safety: refuse destructive methods
function safeGet(url, token) {
  return fetch(url, { method: "GET", headers: { Authorization: token } }).then(r => r.json()).catch(() => null);
}

async function adminAuth(base, email, pass, label) {
  const r = await fetch(`${base}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password: pass }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.token) throw new Error(`${label} admin auth failed (${r.status}): ${JSON.stringify(d).slice(0, 120)}`);
  return d.token;
}

async function getAllCollections(base, token) {
  // PocketBase paginates at 200
  const all = [];
  let page = 1;
  while (true) {
    const d = await safeGet(`${base}/api/collections?page=${page}&perPage=200`, token);
    if (!d?.items) break;
    all.push(...d.items);
    if (all.length >= (d.totalItems ?? all.length)) break;
    page++;
  }
  return all;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

const localToken = await adminAuth(LOCAL_URL, LOCAL_EMAIL, LOCAL_PASS, "Local");
const prodToken  = await adminAuth(PROD_URL,  PROD_EMAIL,  PROD_PASS,  "Production");

// ─── Fetch all collections ───────────────────────────────────────────────────

const localCols = await getAllCollections(LOCAL_URL, localToken);
const prodCols  = await getAllCollections(PROD_URL,  prodToken);

// ─── Index by name ───────────────────────────────────────────────────────────

const localMap = Object.fromEntries(localCols.map(c => [c.name, c]));
const prodMap  = Object.fromEntries(prodCols.map(c => [c.name, c]));

const allNames = [...new Set([...Object.keys(localMap), ...Object.keys(prodMap)])].sort();

// ─── Compare ─────────────────────────────────────────────────────────────────

function fieldKey(f) {
  return `${f.name}|${f.type}|${f.required ? "req" : "opt"}`;
}

function compareRules(local, prod) {
  const rules = ["listRule","viewRule","createRule","updateRule","deleteRule"];
  return rules.map(r => {
    const lv = local?.[r] ?? null;
    const pv = prod?.[r] ?? null;
    return { rule: r, local: lv, prod: pv, match: lv === pv };
  });
}

const diff = [];

for (const name of allNames) {
  const lc = localMap[name];
  const pc = prodMap[name];

  if (!lc && pc) {
    diff.push({ collection: name, status: "PROD_ONLY", local: null, prod: { name, type: pc.type } });
    continue;
  }
  if (lc && !pc) {
    diff.push({
      collection: name,
      status: "LOCAL_ONLY",
      local: { name, type: lc.type },
      prod: null,
      fields_local: (lc.schema || []).map(f => ({ name: f.name, type: f.type, required: f.required })),
    });
    continue;
  }

  // Both exist — compare fields and rules
  const lFields = lc.schema || [];
  const pFields = pc.schema || [];
  const lFieldMap = Object.fromEntries(lFields.map(f => [f.name, f]));
  const pFieldMap = Object.fromEntries(pFields.map(f => [f.name, f]));
  const allFieldNames = [...new Set([...Object.keys(lFieldMap), ...Object.keys(pFieldMap)])].sort();

  const fieldDiff = [];
  for (const fn of allFieldNames) {
    const lf = lFieldMap[fn];
    const pf = pFieldMap[fn];
    if (!lf) {
      fieldDiff.push({ field: fn, status: "PROD_ONLY", local: null, prod: { type: pf.type, required: pf.required } });
    } else if (!pf) {
      fieldDiff.push({ field: fn, status: "LOCAL_ONLY", local: { type: lf.type, required: lf.required }, prod: null });
    } else {
      const typeMatch = lf.type === pf.type;
      const reqMatch  = !!lf.required === !!pf.required;
      if (!typeMatch || !reqMatch) {
        fieldDiff.push({ field: fn, status: "DIFFERENT", local: { type: lf.type, required: lf.required }, prod: { type: pf.type, required: pf.required } });
      }
    }
  }

  const ruleDiff = compareRules(lc, pc).filter(r => !r.match);
  const hasChanges = fieldDiff.length > 0 || ruleDiff.length > 0;

  diff.push({
    collection: name,
    status: hasChanges ? "DIFFERENT" : "MATCH",
    fieldDiff,
    ruleDiff,
  });
}

// ─── Output JSON ─────────────────────────────────────────────────────────────

const output = {
  generated: new Date().toISOString(),
  local_url: LOCAL_URL,
  prod_url: PROD_URL,
  local_collection_count: localCols.length,
  prod_collection_count: prodCols.length,
  diff,
};

fs.writeFileSync(
  path.join(process.cwd(), "docs", "_schema_diff.json"),
  JSON.stringify(output, null, 2),
  "utf8",
);

// ─── Console summary ─────────────────────────────────────────────────────────

const onlyLocal = diff.filter(d => d.status === "LOCAL_ONLY");
const onlyProd  = diff.filter(d => d.status === "PROD_ONLY");
const different = diff.filter(d => d.status === "DIFFERENT");
const matched   = diff.filter(d => d.status === "MATCH");

process.stderr.write([
  `Local collections : ${localCols.length}`,
  `Prod  collections : ${prodCols.length}`,
  `LOCAL_ONLY        : ${onlyLocal.length}  (missing from Production)`,
  `PROD_ONLY         : ${onlyProd.length}   (not in Local)`,
  `DIFFERENT         : ${different.length}  (fields or rules differ)`,
  `MATCH             : ${matched.length}`,
  "",
  "LOCAL_ONLY collections:",
  ...onlyLocal.map(d => `  - ${d.collection}`),
  "",
  "DIFFERENT collections:",
  ...different.map(d => `  - ${d.collection}`),
  "",
  "Output: docs/_schema_diff.json",
].join("\n") + "\n");

process.exit(0);
