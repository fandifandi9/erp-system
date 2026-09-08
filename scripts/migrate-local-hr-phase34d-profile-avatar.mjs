/**
 * LOCAL-ONLY Phase 34D: profiles.avatar (file) + bio + date_of_birth for self-service profile.
 *
 * Run: npm run migrate:local-hr-phase34d
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

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 15);
}

const { url, email, pass } = loadEnv();
if (!url || url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
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

function ensureField(schema, field) {
  if (schema.some((f) => f.name === field.name)) {
    console.log(`  OK: profiles.${field.name}`);
    return false;
  }
  schema.push(field);
  console.log(`  + profiles.${field.name}`);
  return true;
}

async function main() {
  console.log("Phase 34D local migration — profiles avatar + self-service fields");

  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const colRes = await pbJson("GET", "/api/collections/profiles", null, token);
  if (!colRes.ok) throw new Error("profiles collection missing");

  const col = colRes.data;
  const schema = [...(col.schema ?? col.fields ?? [])];

  let changed = false;
  changed =
    ensureField(schema, {
      system: false,
      id: fieldId("avt"),
      name: "avatar",
      type: "file",
      required: false,
      presentable: false,
      unique: false,
      options: {
        maxSelect: 1,
        maxSize: 5242880,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        thumbs: ["100x100", "200x200"],
      },
    }) || changed;

  changed =
    ensureField(schema, {
      system: false,
      id: fieldId("bio"),
      name: "bio",
      type: "text",
      required: false,
      presentable: false,
      unique: false,
      options: { min: null, max: null, pattern: "" },
    }) || changed;

  changed =
    ensureField(schema, {
      system: false,
      id: fieldId("dob"),
      name: "date_of_birth",
      type: "date",
      required: false,
      presentable: false,
      unique: false,
      options: { min: "", max: "" },
    }) || changed;

  if (!changed) {
    console.log("  Schema sudah lengkap — tidak ada perubahan.");
    console.log("Phase 34D profile avatar migration OK");
    return;
  }

  const patchBody = col.fields ? { fields: schema } : { schema };
  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, { ...col, ...patchBody }, token);
  if (!patch.ok) {
    throw new Error(`PATCH profiles failed: ${JSON.stringify(patch.data).slice(0, 400)}`);
  }

  console.log("Phase 34D profile avatar migration OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
