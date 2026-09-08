/**
 * Backup PocketBase via Admin API.
 * Run: npm run backup:pb
 * Output: backups/pb/pb-backup-YYYY-MM-DDTHH-mm-ss.zip
 */
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

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
if (!url || !email || !pass) {
  console.error("NEXT_PUBLIC_POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD wajib.");
  process.exit(1);
}

const base = url.replace(/\/$/, "");
const authRes = await fetch(`${base}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
});
const auth = await authRes.json();
if (!auth.token) {
  console.error("Auth failed", auth);
  process.exit(1);
}

const headers = { Authorization: auth.token };

const createRes = await fetch(`${base}/api/backups`, {
  method: "POST",
  headers,
});
if (!createRes.ok) {
  const err = await createRes.text();
  console.error("Gagal membuat backup PB:", createRes.status, err);
  process.exit(1);
}

const listRes = await fetch(`${base}/api/backups`, { headers });
const list = await listRes.json();
const latest = Array.isArray(list) ? list[0] : list?.items?.[0];
if (!latest?.key) {
  console.error("Backup dibuat tapi daftar backup kosong.", list);
  process.exit(1);
}

const downloadRes = await fetch(`${base}/api/backups/${encodeURIComponent(latest.key)}`, {
  headers: { ...headers, Accept: "application/zip" },
});
if (!downloadRes.ok || !downloadRes.body) {
  console.warn(
    `Unduh backup gagal (${downloadRes.status}). Backup sudah dibuat di server PB dengan key: ${latest.key}`,
  );
  console.warn("Unduh manual via PocketBase Admin → Settings → Backups.");
  process.exit(0);
}

const outDir = path.join(process.cwd(), "backups", "pb");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outFile = path.join(outDir, `pb-backup-${stamp}.zip`);

await pipeline(Readable.fromWeb(downloadRes.body), fs.createWriteStream(outFile));
console.log(`OK: ${outFile}`);
console.log(`Key: ${latest.key}`);
