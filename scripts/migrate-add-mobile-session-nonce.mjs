/**
 * LOCAL-ONLY migration: tambah field `mobile_session_nonce` ke koleksi `users`.
 *
 * Dijalankan sekali terhadap LOCAL PocketBase.
 * JANGAN jalankan ke Production — field harus ditambah manual di Production PB Admin.
 *
 * Run:
 *   node scripts/migrate-add-mobile-session-nonce.mjs
 *
 * Requires .env.local:
 *   NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
 *   POCKETBASE_ADMIN_EMAIL=...
 *   POCKETBASE_ADMIN_PASSWORD=...
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
  throw new Error("No .env.local or .env with PocketBase config");
}

const { url, email, pass } = loadEnv();
const BASE = url.replace(/\/$/, "");

if (!BASE || !email || !pass) {
  console.error("BLOCKED — NEXT_PUBLIC_POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD required");
  process.exit(1);
}

// Guard: jangan berjalan terhadap Production
if (BASE.includes("pb.serba.space") && !BASE.includes("staging")) {
  console.error("BLOCKED — Jangan jalankan migration ini terhadap Production.");
  process.exit(1);
}

console.log(`Target: ${BASE}`);
console.log("Migration: add mobile_session_nonce to users");

// Auth admin
const authRes = await fetch(`${BASE}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
});
const auth = await authRes.json().catch(() => ({}));
if (!auth.token) {
  console.error("Admin auth failed:", authRes.status, JSON.stringify(auth).slice(0, 200));
  process.exit(1);
}
const token = auth.token;
console.log("Admin auth OK");

// Baca schema users
const usersRes = await fetch(`${BASE}/api/collections/users`, {
  headers: { Authorization: token },
});
const users = await usersRes.json().catch(() => ({}));
if (!users.id) {
  console.error("GET users collection failed:", usersRes.status);
  process.exit(1);
}

// Cek apakah field sudah ada
const schema = Array.isArray(users.schema) ? users.schema : [];
const alreadyExists = schema.some(
  (f) => f.name === "mobile_session_nonce"
);

if (alreadyExists) {
  console.log("✅ Field mobile_session_nonce sudah ada — tidak perlu migrasi.");
  process.exit(0);
}

// Tambah field
const newField = {
  name: "mobile_session_nonce",
  type: "text",
  required: false,
  options: { min: null, max: null, pattern: "" },
};
users.schema = [...schema, newField];

// PATCH collection
const patchRes = await fetch(`${BASE}/api/collections/users`, {
  method: "PATCH",
  headers: { Authorization: token, "Content-Type": "application/json" },
  body: JSON.stringify({ schema: users.schema }),
});
const patched = await patchRes.json().catch(() => ({}));

if (!patchRes.ok) {
  console.error("PATCH users failed:", patchRes.status, JSON.stringify(patched).slice(0, 400));
  process.exit(1);
}

// Verifikasi
const verify = patched.schema ?? [];
const added = verify.some((f) => f.name === "mobile_session_nonce");
if (!added) {
  console.error("ERROR — field tidak ditemukan setelah PATCH. Check PB version.");
  process.exit(1);
}

console.log("✅ Field mobile_session_nonce berhasil ditambahkan ke users collection.");
console.log("Production: TIDAK disentuh. Jalankan migration Production secara manual lewat PB Admin UI.");
