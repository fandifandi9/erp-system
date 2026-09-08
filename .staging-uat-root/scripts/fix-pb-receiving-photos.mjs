/** Tambah field foto penerimaan (opsional) di biz_purchase_orders */
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

const colRes = await fetch(`${url}/api/collections/biz_purchase_orders`, { headers });
const col = await colRes.json();
const schema = [...(col.schema ?? col.fields ?? [])];
const name = "receiving_photos";
if (schema.some((f) => f.name === name)) {
  console.log(`Field ${name} sudah ada.`);
  process.exit(0);
}
schema.push({
  system: false,
  id: fieldId("rcph"),
  name,
  type: "file",
  required: false,
  presentable: false,
  unique: false,
  options: {
    maxSelect: 10,
    maxSize: 10485760,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    thumbs: ["100x100"],
  },
});
const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ schema }),
});
const patchBody = await patchRes.json();
if (!patchRes.ok) {
  console.error("PATCH failed", patchRes.status, patchBody);
  process.exit(1);
}
console.log(`OK: ${name} ditambahkan ke biz_purchase_orders`);
