/**
 * Koleksi sesi meja validator WMS + field qr_payload di wms_workstations.
 * Run: node scripts/fix-pb-wms-workstation-sessions-schema.mjs
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

const headers = {
  Authorization: auth.token,
  "Content-Type": "application/json",
};

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 15);
}

async function getCollectionId(name) {
  const res = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await res.json();
  return col.id || null;
}

async function resolveUsersCollectionId() {
  for (const name of ["users", "_pb_users_auth_"]) {
    const id = await getCollectionId(name);
    if (id) return id;
  }
  return null;
}

function textField(name, idPrefix) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: {},
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

function relationField(name, collectionId, idPrefix) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "relation",
    required: false,
    presentable: false,
    unique: false,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
      displayFields: null,
    },
  };
}

function ensureField(schema, field) {
  const idx = schema.findIndex((f) => f.name === field.name);
  if (idx < 0) {
    schema.push(field);
    return true;
  }
  return false;
}

async function patchCollectionSchema(name, extraFields) {
  const colRes = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await colRes.json();
  if (!col.id) {
    console.log(`SKIP ${name} — koleksi tidak ada`);
    return false;
  }
  const schema = [...(col.schema ?? col.fields ?? [])];
  let changed = false;
  for (const f of extraFields) {
    if (ensureField(schema, f)) changed = true;
  }
  if (!changed) {
    console.log(`Schema ${name} sudah lengkap.`);
    return true;
  }
  const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ schema }),
  });
  const body = await patchRes.json();
  if (!patchRes.ok) {
    console.error(`PATCH ${name} failed`, patchRes.status, body);
    return false;
  }
  console.log(`OK patch ${name}`);
  return true;
}

const usersId = await resolveUsersCollectionId();

/* wms_workstations — tambah qr_payload jika koleksi ada */
await patchCollectionSchema("wms_workstations", [textField("qr_payload", "wsqr")]);

const SESSIONS = "wms_workstation_sessions";
const existing = await fetch(`${url}/api/collections/${SESSIONS}`, { headers });
const existingCol = await existing.json();

const sessionSchema = [
  ...(usersId ? [relationField("user", usersId, "wssu")] : []),
  textField("workstation_id", "wswid"),
  textField("workstation_code", "wscode"),
  textField("workstation_name", "wsname"),
  textField("workstation_location", "wsloc"),
  textField("workstation_cctv", "wscctv"),
  {
    system: false,
    id: fieldId("wsst"),
    name: "status",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: {
      maxSelect: 1,
      values: ["active", "closed", "forced_closed"],
    },
  },
  {
    system: false,
    id: fieldId("wsch"),
    name: "channel",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: {
      maxSelect: 1,
      values: ["mobile", "office_terminal", "web_desk_scan"],
    },
  },
  textField("device_id", "wsdev"),
  boolField("bonus_eligible", "wsbon"),
  boolField("via_qr", "wsqrflag"),
  textField("check_in_at", "wscin"),
  textField("check_out_at", "wscout"),
  textField("closed_reason", "wscls"),
  textField("bound_at", "wsbnd"),
];

if (!existingCol.id) {
  if (!usersId) {
    console.error("users collection required for wms_workstation_sessions");
    process.exit(1);
  }
  console.log(`CREATE ${SESSIONS}`);
  const createRes = await fetch(`${url}/api/collections`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: SESSIONS,
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      schema: sessionSchema,
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error("Create failed", created);
    process.exit(1);
  }
  console.log("OK created:", created.name);
} else {
  console.log(`${SESSIONS} sudah ada — patch fields`);
  await patchCollectionSchema(SESSIONS, sessionSchema);
}

console.log("Selesai. Sesi meja WMS siap dipakai.");
