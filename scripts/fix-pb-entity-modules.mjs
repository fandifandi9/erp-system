/**
 * Modul operasional per entitas: warehouse_role, is_primary (gudang/kas/toko).
 * Run: npm run pb:entity-modules
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
    return { url: get("NEXT_PUBLIC_POCKETBASE_URL"), email: get("POCKETBASE_ADMIN_EMAIL"), pass: get("POCKETBASE_ADMIN_PASSWORD") };
  }
  throw new Error("No .env");
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

function fieldId(p) {
  return `${p}${Date.now().toString(36)}`.slice(0, 15);
}

async function patchCollection(name, fields) {
  const colRes = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await colRes.json();
  if (!col.id) {
    console.log(`  skip ${name} — koleksi belum ada (jalankan npm run pb:cash-schema jika perlu)`);
    return;
  }
  const schema = [...(col.schema ?? col.fields ?? [])];
  let changed = false;
  for (const f of fields) {
    if (schema.some((x) => x.name === f.name)) {
      console.log(`  OK: ${name}.${f.name}`);
      continue;
    }
    schema.push(f);
    changed = true;
    console.log(`  + ${name}.${f.name}`);
  }
  if (!changed) return;
  const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ schema }),
  });
  if (!patchRes.ok) {
    console.error(`PATCH schema ${name} failed`, await patchRes.json());
    process.exit(1);
  }
}

const OWNER_ENTITY_RULES = {
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule:
    '@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")',
  updateRule:
    '@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")',
  deleteRule:
    '@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")',
};

async function patchOwnerEntityRules(name) {
  const colRes = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await colRes.json();
  if (!col.id) {
    console.log(`  skip ${name} — koleksi belum ada`);
    return;
  }
  const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      ...col,
      listRule: OWNER_ENTITY_RULES.listRule,
      viewRule: OWNER_ENTITY_RULES.viewRule,
      createRule: OWNER_ENTITY_RULES.createRule,
      updateRule: OWNER_ENTITY_RULES.updateRule,
      deleteRule: OWNER_ENTITY_RULES.deleteRule,
    }),
  });
  if (!patchRes.ok) {
    const err = await patchRes.json();
    console.warn(`  warn ${name} rules: ${err.message || JSON.stringify(err)} — tetap open rule`);
    return;
  }
  console.log(`  rules OK: ${name} (Owner write)`);
}

const boolField = (name, p) => ({
  system: false,
  id: fieldId(p),
  name,
  type: "bool",
  required: false,
  presentable: false,
  unique: false,
  options: {},
});

const selectField = (name, p, values) => ({
  system: false,
  id: fieldId(p),
  name,
  type: "select",
  required: false,
  presentable: false,
  unique: false,
  options: { maxSelect: 1, values },
});

await patchCollection("inv_warehouses", [
  selectField("warehouse_role", "whrl", ["main", "retail", "transit", "damaged"]),
  boolField("is_primary", "whpr"),
]);

await patchCollection("biz_cash_accounts", [boolField("is_primary", "cshpr")]);
await patchCollection("biz_stores", [boolField("is_primary", "stpr")]);

console.log("Owner write rules (Profil Perusahaan / setup modul):");
for (const col of ["biz_company_profile", "biz_stores", "inv_warehouses", "biz_cash_accounts"]) {
  await patchOwnerEntityRules(col);
}

// Backfill: gudang pertama per company → main + is_primary
const whRes = await fetch(`${url}/api/collections/inv_warehouses/records?perPage=500&sort=created`, { headers });
const warehouses = (await whRes.json()).items ?? [];
const byCompany = new Map();
for (const w of warehouses) {
  if (!w.company) continue;
  if (!byCompany.has(w.company)) byCompany.set(w.company, w.id);
}
for (const [cid, wid] of byCompany) {
  await fetch(`${url}/api/collections/inv_warehouses/records/${wid}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ warehouse_role: "main", is_primary: true }),
  });
  console.log(`Backfill gudang utama: ${wid} (company ${cid})`);
}

const caColRes = await fetch(`${url}/api/collections/biz_cash_accounts`, { headers });
const caCol = await caColRes.json();
if (caCol.id) {
  const caRes = await fetch(`${url}/api/collections/biz_cash_accounts/records?perPage=500&sort=created`, {
    headers,
  });
  const accounts = (await caRes.json()).items ?? [];
  const caByCo = new Map();
  for (const a of accounts) {
    if (!a.company) continue;
    if (!caByCo.has(a.company)) caByCo.set(a.company, a.id);
  }
  for (const [cid, aid] of caByCo) {
    await fetch(`${url}/api/collections/biz_cash_accounts/records/${aid}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ is_primary: true }),
    });
    console.log(`Backfill rekening utama: ${aid} (company ${cid})`);
  }
} else {
  console.log("skip backfill biz_cash_accounts — koleksi belum ada");
}

console.log("Selesai — modul entitas (role + primary) siap.");
