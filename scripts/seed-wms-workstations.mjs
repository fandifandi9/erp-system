/**
 * Seed meja validator default ke wms_workstations.
 * Run: node scripts/seed-wms-workstations.mjs
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

const defaults = [
  {
    code: "VALIDATOR-01",
    name: "Meja Validator 01",
    location: "Gudang — zona validasi A",
    cctv: "CCTV-V01",
    qr_payload: "serba:ws:VALIDATOR-01",
    is_active: true,
  },
  {
    code: "VALIDATOR-02",
    name: "Meja Validator 02",
    location: "Gudang — zona validasi B",
    cctv: "CCTV-V02",
    qr_payload: "serba:ws:VALIDATOR-02",
    is_active: true,
  },
  {
    code: "VALIDATOR-03",
    name: "Meja Validator 03",
    location: "Gudang — zona validasi C",
    cctv: "CCTV-V03",
    qr_payload: "serba:ws:VALIDATOR-03",
    is_active: true,
  },
];

for (const d of defaults) {
  const filter = encodeURIComponent(`code="${d.code}"`);
  const ex = await fetch(
    `${url}/api/collections/wms_workstations/records?filter=${filter}&perPage=1`,
    { headers },
  );
  const j = await ex.json();
  if (j.items?.length) {
    console.log("skip", d.code);
    continue;
  }
  const cr = await fetch(`${url}/api/collections/wms_workstations/records`, {
    method: "POST",
    headers,
    body: JSON.stringify(d),
  });
  const body = await cr.json();
  if (!cr.ok) {
    console.error("fail", d.code, body);
  } else {
    console.log("created", d.code, body.id);
  }
}

console.log("Selesai.");
