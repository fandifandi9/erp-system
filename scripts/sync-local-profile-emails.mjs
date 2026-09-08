/**
 * LOCAL-ONLY: salin email dari users → profiles.email (untuk karyawan yang sudah ada).
 *
 * Run: node scripts/sync-local-profile-emails.mjs
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
if (!url || url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
  console.error("BLOCKED — LOCAL only");
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

const auth = await pbJson("POST", "/api/admins/auth-with-password", { identity: email, password: pass });
if (!auth.data?.token) {
  console.error("Admin auth failed");
  process.exit(1);
}
const token = auth.data.token;

const profiles = await pbJson("GET", "/api/collections/profiles/records?perPage=500", null, token);
const users = await pbJson("GET", "/api/collections/users/records?perPage=500", null, token);

const userEmailById = new Map();
for (const u of users.data?.items || []) {
  if (u.id && u.email) userEmailById.set(u.id, String(u.email).trim());
}

let updated = 0;
for (const p of profiles.data?.items || []) {
  const uid = typeof p.user === "string" ? p.user : p.user?.id;
  const userEmail = uid ? userEmailById.get(uid) : "";
  const profileEmail = String(p.email || "").trim();
  if (!userEmail) continue;
  if (profileEmail === userEmail) continue;

  const patch = await pbJson(
    "PATCH",
    `/api/collections/profiles/records/${p.id}`,
    { email: userEmail },
    token,
  );
  if (!patch.ok) {
    console.error("PATCH failed", p.id, patch.status);
    continue;
  }
  updated++;
  console.log("synced", p.name || p.id, "→", userEmail);
}

console.log(`Done. Updated ${updated} profile(s).`);
