/**
 * LOCAL-ONLY Phase 34B: attendance_logs company + metrics + schedule snapshot fields.
 *
 * Run: npm run migrate:local-hr-phase34b
 */

import fs from "fs";
import path from "path";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  const text = fs.readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}=(.*)$`, "m"));
    if (!m) return "";
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
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
function numberField(name) {
  return { name, type: "number", required: false, system: false, options: { min: null, max: null, noDecimal: false } };
}
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
}
function relationField(name, collectionId, required = false) {
  return {
    name,
    type: "relation",
    required,
    system: false,
    options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
  };
}
function ensureFields(schema, extras) {
  const names = new Set((schema || []).map((f) => f.name));
  const next = [...(schema || [])];
  for (const f of extras) {
    if (!names.has(f.name)) next.push(f);
  }
  return next;
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

async function main() {
  console.log("Phase 34B local migration — attendance_logs extensions");
  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  if (!companyCol.ok) throw new Error("biz_company_profile missing");
  const companyId = companyCol.data.id;

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  if (!usersCol.ok) throw new Error("users collection missing");
  const usersId = usersCol.data.id;

  const profilesCol = await pbJson("GET", "/api/collections/profiles", null, token);
  if (!profilesCol.ok) throw new Error("profiles collection missing");
  const profiles = profilesCol.data;
  if (!(profiles.schema || []).some((f) => f.name === "manager")) {
    profiles.schema = ensureFields(profiles.schema, [relationField("manager", usersId, false)]);
    const profPatch = await pbJson("PATCH", `/api/collections/${profiles.id}`, profiles, token);
    if (!profPatch.ok) {
      throw new Error(`PATCH profiles.manager: ${JSON.stringify(profPatch.data).slice(0, 400)}`);
    }
    console.log("  added profiles.manager (Phase 31 prerequisite)");
  } else {
    console.log("  profiles.manager already exists");
  }

  const colRes = await pbJson("GET", "/api/collections/attendance_logs", null, token);
  if (!colRes.ok) throw new Error("attendance_logs missing");
  const col = colRes.data;

  const extras = [
    relationField("company_id", companyId, false),
    numberField("early_leave_minutes"),
    numberField("overtime_minutes"),
    textField("schedule_source"),
    textField("schedule_start"),
    textField("schedule_end"),
    textField("schedule_timezone"),
    textField("schedule_assignment_id"),
    numberField("late_grace_minutes"),
    numberField("early_leave_grace_minutes"),
    boolField("is_working_day"),
  ];

  col.schema = ensureFields(col.schema, extras);
  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
  if (!patch.ok) throw new Error(`PATCH attendance_logs: ${JSON.stringify(patch.data).slice(0, 400)}`);

  console.log("  updated attendance_logs schema (Phase 34B fields)");

  // Backfill biz_user_companies for users missing legal-entity membership (Phase 34B D3).
  const companiesRes = await pbJson(
    "GET",
    "/api/collections/biz_company_profile/records?perPage=500&sort=created",
    null,
    token,
  );
  const companyRows = companiesRes.data?.items ?? [];
  const defaultCid = companyRows[0]?.id;
  if (defaultCid) {
    const usersRes = await pbJson("GET", "/api/collections/users/records?perPage=500", null, token);
    const users = usersRes.data?.items ?? [];
    const accessRes = await pbJson(
      "GET",
      "/api/collections/biz_user_companies/records?perPage=500",
      null,
      token,
    );
    const existingAccess = accessRes.data?.items ?? [];
    const existingKeys = new Set(existingAccess.map((r) => `${r.user}|${r.company}`));
    let created = 0;
    for (const u of users) {
      const isOwner =
        String(u.account_type || "").toLowerCase() === "owner" ||
        String(u.role || "").toLowerCase() === "owner";
      const targets = isOwner
        ? companyRows.map((c) => c.id)
        : [u.default_company, u.active_company, defaultCid].filter(Boolean);
      for (const cid of [...new Set(targets)]) {
        const key = `${u.id}|${cid}`;
        if (existingKeys.has(key)) continue;
        const cr = await pbJson(
          "POST",
          "/api/collections/biz_user_companies/records",
          { user: u.id, company: cid, is_active: true },
          token,
        );
        if (cr.ok) {
          created++;
          existingKeys.add(key);
        }
      }
    }
    console.log(`  backfill biz_user_companies: ${created} baru (${existingAccess.length} sudah ada)`);
  }

  console.log("OK — Phase 34B local migration complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
