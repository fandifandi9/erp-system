/**
 * Fase 5: hak akses user per entitas (many-to-many users ↔ company).
 * Run: npm run pb:company-access
 */
import fs from "fs";
import path from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const get = (k) => {
      const m = text.match(new RegExp(`^${k}=(.+)$`, "m"));
      if (!m) return "";
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    };
    return {
      url: get("NEXT_PUBLIC_POCKETBASE_URL"),
      email: get("POCKETBASE_ADMIN_EMAIL"),
      pass: get("POCKETBASE_ADMIN_PASSWORD"),
    };
  }
  throw new Error("No .env.local or .env");
}

const { url, email, pass } = loadEnv();

const authRes = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
});
const auth = await authRes.json();
if (!auth.token) {
  console.error("Auth failed", auth);
  process.exit(1);
}

const headers = { Authorization: auth.token, "Content-Type": "application/json" };

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 15);
}

async function getCollectionId(name) {
  const res = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await res.json();
  if (!col.id) throw new Error(`Collection ${name} tidak ditemukan`);
  return col.id;
}

function relationField(name, collectionId, idPrefix, required = false) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "relation",
    required,
    presentable: false,
    unique: false,
    options: {
      collectionId,
      cascadeDelete: true,
      minSelect: required ? 1 : 0,
      maxSelect: 1,
      displayFields: [],
    },
  };
}

function boolField(name, idPrefix) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "bool",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  };
}

async function ensureCollection(name, schema) {
  const existingRes = await fetch(`${url}/api/collections/${name}`, { headers });
  const existing = await existingRes.json();
  if (existing.id) {
    console.log(`Collection ${name} sudah ada.`);
    return existing.id;
  }
  const createRes = await fetch(`${url}/api/collections`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name,
      type: "base",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      schema,
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error("Create failed", created);
    process.exit(1);
  }
  console.log(`Collection ${name} dibuat.`);
  return created.id;
}

const usersId = await getCollectionId("users");
const companyId = await getCollectionId("biz_company_profile");

await ensureCollection("biz_user_companies", [
  relationField("user", usersId, "ucus", true),
  relationField("company", companyId, "ucco", true),
  boolField("is_active", "ucac"),
]);

// ── Backfill: setiap user non-owner dapat akses ke default_company / active_company / entitas pertama
const companies = await (
  await fetch(`${url}/api/collections/biz_company_profile/records?perPage=500&sort=created`, { headers })
).json();
const companyRows = companies.items ?? [];
const defaultCid = companyRows[0]?.id;
if (!defaultCid) {
  console.log("Tidak ada entitas — skip backfill.");
  process.exit(0);
}

const usersRes = await fetch(`${url}/api/collections/users/records?perPage=500`, { headers });
const users = (await usersRes.json()).items ?? [];

const accessRes = await fetch(`${url}/api/collections/biz_user_companies/records?perPage=500`, { headers });
const existingAccess = (await accessRes.json()).items ?? [];
const existingKeys = new Set(existingAccess.map((r) => `${r.user}|${r.company}`));

let created = 0;
function isHrUser(u) {
  const accountType = String(u.account_type || "").toLowerCase();
  const roleCode = String(u.role_code || u.role || "").toLowerCase();
  return accountType === "user" && roleCode === "hr";
}

for (const u of users) {
  const isOwner =
    String(u.account_type || "").toLowerCase() === "owner" ||
    String(u.role || "").toLowerCase() === "owner";

  const activeCompanyIds = companyRows.filter((c) => c.is_active !== false).map((c) => c.id);

  const targetCompanies = isOwner
    ? activeCompanyIds
    : isHrUser(u)
      ? activeCompanyIds
      : [u.default_company, u.active_company, defaultCid].filter(Boolean);

  const unique = [...new Set(targetCompanies)];
  for (const cid of unique) {
    const key = `${u.id}|${cid}`;
    if (existingKeys.has(key)) continue;
    const cr = await fetch(`${url}/api/collections/biz_user_companies/records`, {
      method: "POST",
      headers,
      body: JSON.stringify({ user: u.id, company: cid, is_active: true }),
    });
    if (cr.ok) {
      created++;
      existingKeys.add(key);
    }
  }
}

console.log(`Backfill biz_user_companies: ${created} record baru (${existingAccess.length} sudah ada).`);
console.log("Selesai — hak akses entitas per user siap.");
