/**
 * Temporary: check local PocketBase collections (runs in LOCAL only)
 * Run: node scripts/_check-local-collections.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://127.0.0.1:8090";

function loadEnv() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const ENV = loadEnv();
const ADMIN_EMAIL = ENV.PB_ADMIN_EMAIL || "admin@local.test";
const ADMIN_PASS = ENV.PB_ADMIN_PASSWORD || ENV.PB_ADMIN_PASS || "";

// Safety guard
if (BASE.includes("serba.space") || BASE.includes("staging")) {
  console.error("BLOCKED — only LOCAL allowed.");
  process.exit(2);
}

try {
  // Authenticate
  const loginRes = await fetch(`${BASE}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  if (!loginRes.ok) {
    const d = await loginRes.json().catch(() => ({}));
    console.error("Admin login failed:", JSON.stringify(d));
    process.exit(1);
  }
  const { token } = await loginRes.json();

  // List collections
  const colRes = await fetch(`${BASE}/api/collections?perPage=200`, {
    headers: { Authorization: token },
  });
  const { items } = await colRes.json();
  const names = (items || []).map((i) => i.name).sort();
  console.log("LOCAL COLLECTIONS:", JSON.stringify(names, null, 2));
  console.log("\nnotifications exists:", names.includes("notifications"));
  console.log("push_tokens exists:", names.includes("push_tokens"));
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
