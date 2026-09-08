/**
 * LOCAL-ONLY Phase 35I-F1 — Organization Structure Mode SSOT.
 * Run: npm run migrate:local-hr-phase35i-f1
 *
 * Additive only:
 * - collection hr_org_structure_config (singleton-style)
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

function textField(name, required = false) {
  return { name, type: "text", required, system: false, options: { min: null, max: null, pattern: "" } };
}

function ensureFields(schema, extras) {
  const names = new Set((schema || []).map((f) => f.name));
  const next = [...(schema || [])];
  let changed = false;
  for (const f of extras) {
    if (!names.has(f.name)) {
      next.push(f);
      changed = true;
      console.log(`  + field ${f.name}`);
    } else {
      console.log(`  OK: ${f.name}`);
    }
  }
  return { schema: next, changed };
}

const { url, email, pass } = loadEnv();
if (!url || !email || !pass || url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
  console.error("BLOCKED — LOCAL PocketBase only (.env.local :8090)");
  process.exit(1);
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

async function adminToken() {
  const r = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!r.ok) throw new Error(`Admin auth failed: ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data.token;
}

async function patchCollection(token, name, patch) {
  const list = await pbJson("GET", "/api/collections", null, token);
  const col = (list.data?.items || []).find((c) => c.name === name);
  if (!col) throw new Error(`Collection missing: ${name}`);
  const r = await pbJson("PATCH", `/api/collections/${col.id}`, patch, token);
  if (!r.ok) throw new Error(`PATCH ${name}: ${JSON.stringify(r.data).slice(0, 400)}`);
}

async function main() {
  console.log("Phase 35I-F1 migration — org structure mode config\n");
  const token = await adminToken();
  const LOCKED = {
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  };

  let col = await pbJson("GET", "/api/collections/hr_org_structure_config", null, token);
  if (!col.ok) {
    const created = await pbJson(
      "POST",
      "/api/collections",
      {
        name: "hr_org_structure_config",
        type: "base",
        schema: [
          textField("mode"),
          textField("configured_at"),
          textField("configured_by"),
          textField("notes"),
        ],
        ...LOCKED,
      },
      token,
    );
    if (!created.ok) {
      throw new Error(`CREATE hr_org_structure_config: ${JSON.stringify(created.data).slice(0, 400)}`);
    }
    console.log("  ✓ hr_org_structure_config created");
    col = await pbJson("GET", "/api/collections/hr_org_structure_config", null, token);
  } else {
    console.log("  · hr_org_structure_config exists");
  }

  const schema = col.data?.schema || [];
  const { schema: next, changed } = ensureFields(schema, [
    textField("mode"),
    textField("configured_at"),
    textField("configured_by"),
    textField("notes"),
  ]);
  if (changed) {
    await patchCollection(token, "hr_org_structure_config", { schema: next, ...LOCKED });
    console.log("  ✓ hr_org_structure_config schema updated");
  } else {
    console.log("  ✓ hr_org_structure_config schema OK");
  }

  console.log("\nPhase 35I-F1 local migration OK (additive only, no data rewrite).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
