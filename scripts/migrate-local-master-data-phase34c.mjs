/**
 * LOCAL-ONLY Phase 34C: entity_type + is_primary + backfill.
 * Run: npm run migrate:local-master-data-phase34c
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

function selectField(name, values) {
  return {
    name,
    type: "select",
    required: false,
    system: false,
    options: { maxSelect: 1, values },
  };
}
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
}
function ensureFields(schema, extras) {
  const names = new Set((schema || []).map((f) => f.name));
  const next = [...(schema || [])];
  for (const f of extras) {
    if (!names.has(f.name)) next.push(f);
  }
  return next;
}

const ENTITY_TYPES = ["PT", "CV", "FIRMA", "YAYASAN", "KOPERASI", "NON_PT", "OTHER"];

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
  console.log("Phase 34C local migration — master data / legal entity");
  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  if (!companyCol.ok) throw new Error("biz_company_profile missing");
  const col = companyCol.data;
  col.schema = ensureFields(col.schema, [selectField("entity_type", ENTITY_TYPES)]);
  const patchCompany = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
  if (!patchCompany.ok) {
    throw new Error(`PATCH biz_company_profile: ${JSON.stringify(patchCompany.data).slice(0, 400)}`);
  }
  console.log("  biz_company_profile.entity_type added");

  const profiles = await pbJson(
    "GET",
    "/api/collections/biz_company_profile/records?perPage=500",
    null,
    token,
  );
  let entityTypeBackfill = 0;
  for (const row of profiles.data?.items ?? []) {
    if (row.entity_type) continue;
    const up = await pbJson(
      "PATCH",
      `/api/collections/biz_company_profile/records/${row.id}`,
      { entity_type: "PT" },
      token,
    );
    if (up.ok) entityTypeBackfill++;
  }
  console.log(`  entity_type backfill: ${entityTypeBackfill} rows`);

  const ucCol = await pbJson("GET", "/api/collections/biz_user_companies", null, token);
  if (!ucCol.ok) throw new Error("biz_user_companies missing");
  const uc = ucCol.data;
  uc.schema = ensureFields(uc.schema, [boolField("is_primary")]);
  const patchUc = await pbJson("PATCH", `/api/collections/${uc.id}`, uc, token);
  if (!patchUc.ok) {
    throw new Error(`PATCH biz_user_companies: ${JSON.stringify(patchUc.data).slice(0, 400)}`);
  }
  console.log("  biz_user_companies.is_primary added");

  const usersRes = await pbJson("GET", "/api/collections/users/records?perPage=500", null, token);
  const users = usersRes.data?.items ?? [];
  const accessRes = await pbJson(
    "GET",
    "/api/collections/biz_user_companies/records?perPage=500&sort=created",
    null,
    token,
  );
  const accessRows = accessRes.data?.items ?? [];
  const byUser = new Map();
  for (const row of accessRows) {
    if (row.is_active === false) continue;
    const uid = row.user;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(row);
  }

  let primarySet = 0;
  for (const [userId, rows] of byUser) {
    const hasPrimary = rows.some((r) => r.is_primary === true);
    if (hasPrimary) continue;

    const user = users.find((u) => u.id === userId);
    let primaryId = null;

    if (rows.length === 1) {
      primaryId = rows[0].id;
    } else if (user) {
      const pref = [user.default_company, user.active_company].find(
        (c) => c && rows.some((r) => r.company === c),
      );
      if (pref) {
        primaryId = rows.find((r) => r.company === pref)?.id;
      }
      if (!primaryId) primaryId = rows[0]?.id;
    } else {
      primaryId = rows[0]?.id;
    }

    if (!primaryId) continue;

    for (const row of rows) {
      const shouldPrimary = row.id === primaryId;
      if (row.is_primary === shouldPrimary) continue;
      const up = await pbJson(
        "PATCH",
        `/api/collections/biz_user_companies/records/${row.id}`,
        { is_primary: shouldPrimary },
        token,
      );
      if (up.ok && shouldPrimary) primarySet++;
    }

    const primaryRow = rows.find((r) => r.id === primaryId);
    if (primaryRow && user) {
      const companyId = primaryRow.company;
      if (user.default_company !== companyId || user.active_company !== companyId) {
        await pbJson(
          "PATCH",
          `/api/collections/users/records/${userId}`,
          { default_company: companyId, active_company: companyId },
          token,
        );
      }
    }
  }
  console.log(`  is_primary backfill: ${primarySet} users`);

  console.log("OK — Phase 34C local migration complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
