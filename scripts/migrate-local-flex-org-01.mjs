/**
 * LOCAL-ONLY Phase FLEX-ORG-01 — Position workspace domain + company operating model.
 * Run: npm run migrate:local-flex-org-01
 *
 * NO production / serba.space / :8091 / :8092.
 */

import fs from "fs";
import path from "path";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) throw new Error(".env.local missing");
  const text = fs.readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}=(.*)$`, "m"));
    if (!m) return "";
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  };
  return {
    url: get("NEXT_PUBLIC_POCKETBASE_URL").replace(/\/$/, ""),
    email: get("POCKETBASE_ADMIN_EMAIL"),
    pass: get("POCKETBASE_ADMIN_PASSWORD"),
  };
}

const { url, email, pass } = loadEnv();
if (!url || !email || !pass || url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
  console.error("BLOCKED — LOCAL PocketBase only (.env.local :8090)");
  process.exit(1);
}

function selectField(name, values, required = false) {
  return {
    name,
    type: "select",
    required,
    system: false,
    options: { maxSelect: 1, values },
  };
}

function textField(name, required = false) {
  return {
    name,
    type: "text",
    required,
    system: false,
    options: { min: null, max: null, pattern: "" },
  };
}

async function pbJson(method, pathSuffix, body, token) {
  const res = await fetch(`${url}${pathSuffix}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function ensureFields(token, collectionName, extras) {
  const colRes = await pbJson("GET", `/api/collections/${collectionName}`, null, token);
  if (!colRes.ok) {
    console.warn(`SKIP — collection missing: ${collectionName}`);
    return;
  }
  const col = colRes.data;
  const schemaKey = Array.isArray(col.schema) ? "schema" : Array.isArray(col.fields) ? "fields" : "schema";
  const current = col[schemaKey] || [];
  const names = new Set(current.map((f) => f.name));
  const toAdd = extras.filter((f) => !names.has(f.name));
  if (toAdd.length === 0) {
    console.log(`OK ${collectionName} — fields already present`);
    return;
  }
  const next = [...current, ...toAdd];
  const payload = { ...col, [schemaKey]: next };
  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, payload, token);
  if (!patch.ok) throw new Error(`PATCH ${collectionName} failed: ${JSON.stringify(patch.data)}`);
  console.log(`ADDED ${collectionName}: ${toAdd.map((f) => f.name).join(", ")}`);
}

async function main() {
  console.log("=== LOCAL migrate Phase FLEX-ORG-01 ===");
  console.log("PB:", url);

  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error(`Admin auth failed: ${JSON.stringify(auth.data)}`);
  const token = auth.data.token;

  await ensureFields(token, "hr_org_positions", [
    selectField(
      "workspace_domain",
      ["hr", "finance", "warehouse", "purchasing", "sales", "pos", "director", "general"],
      false,
    ),
    textField("org_level_label", false),
  ]);

  await ensureFields(token, "biz_company_profile", [
    selectField("operating_mode", ["STANDALONE", "GROUP_MEMBER", "INDEPENDENT"], false),
    textField("management_group", false),
  ]);

  console.log("DONE — FLEX-ORG-01 local schema ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
