/**
 * LOCAL-ONLY Phase 35I-D — Organizational Position Master.
 * Run: npm run migrate:local-hr-phase35i-d
 *
 * Additive only:
 * - collection hr_org_positions
 * - profiles.org_position_id (text FK)
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
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
}
function numberField(name) {
  return { name, type: "number", required: false, system: false, options: { min: null, max: null, noDecimal: false } };
}
function relationField(name, collectionId, required = false) {
  return {
    name,
    type: "relation",
    required,
    system: false,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
      displayFields: null,
    },
  };
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
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function patchCollection(token, name, patch) {
  const existing = await pbJson("GET", `/api/collections/${name}`, null, token);
  if (!existing.ok) throw new Error(`Collection ${name} missing`);
  const col = existing.data;
  Object.assign(col, patch);
  const res = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
  if (!res.ok) throw new Error(`PATCH ${name}: ${JSON.stringify(res.data).slice(0, 400)}`);
}

async function main() {
  console.log("Phase 35I-D migration — org position master\n");

  let auth = await pbJson("POST", "/api/collections/_superusers/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) {
    auth = await pbJson("POST", "/api/admins/auth-with-password", {
      identity: email,
      password: pass,
    });
  }
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  const usersId = usersCol.data.id;
  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  if (!companyCol.ok) throw new Error("biz_company_profile missing");
  const companyId = companyCol.data.id;

  const LOCKED = {
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  };

  let positionsCol = await pbJson("GET", "/api/collections/hr_org_positions", null, token);
  if (!positionsCol.ok) {
    const created = await pbJson(
      "POST",
      "/api/collections",
      {
        name: "hr_org_positions",
        type: "base",
        schema: [
          relationField("company", companyId, true),
          textField("name", true),
          textField("code"),
          textField("department"),
          textField("division"),
          boolField("is_active"),
          boolField("is_root"),
          numberField("sort_order"),
          textField("notes"),
          relationField("holder_user", usersId, false),
        ],
        ...LOCKED,
      },
      token,
    );
    if (!created.ok) throw new Error(`CREATE hr_org_positions: ${JSON.stringify(created.data).slice(0, 400)}`);
    console.log("  ✓ hr_org_positions created");
    positionsCol = await pbJson("GET", "/api/collections/hr_org_positions", null, token);
  } else {
    console.log("  · hr_org_positions exists");
  }

  const positionsId = positionsCol.data.id;
  const { schema: posSchema, changed: posChanged } = ensureFields(positionsCol.data.schema, [
    relationField("company", companyId, true),
    textField("name", true),
    textField("code"),
    textField("department"),
    textField("division"),
    boolField("is_active"),
    boolField("is_root"),
    numberField("sort_order"),
    textField("notes"),
    relationField("holder_user", usersId, false),
    relationField("parent_position", positionsId, false),
  ]);
  if (posChanged) {
    await patchCollection(token, "hr_org_positions", { schema: posSchema, ...LOCKED });
    console.log("  ✓ hr_org_positions schema updated");
  }

  const profilesCol = await pbJson("GET", "/api/collections/profiles", null, token);
  if (!profilesCol.ok) throw new Error("profiles missing");
  const { schema: profileSchema, changed: profileChanged } = ensureFields(profilesCol.data.schema, [
    textField("org_position_id"),
  ]);
  if (profileChanged) {
    await patchCollection(token, "profiles", { schema: profileSchema });
    console.log("  ✓ profiles.org_position_id added");
  }

  console.log("\nPhase 35I-D local migration OK (additive only, no data rewrite).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
