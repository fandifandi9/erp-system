import fs from "fs";
function getKey(text, key) {
  const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) return "";
  let v = m[1].trim().replace(/\r$/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}
const prodText = fs.readFileSync(".env.local.production-backup", "utf8");
const url = (getKey(prodText, "NEXT_PUBLIC_POCKETBASE_URL") || "https://pb.serba.space").replace(/\/$/, "");
const auth = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: getKey(prodText, "POCKETBASE_ADMIN_EMAIL"), password: getKey(prodText, "POCKETBASE_ADMIN_PASSWORD") }),
}).then((r) => r.json());
const token = auth.token;
for (const col of ["notifications", "push_tokens"]) {
  const r = await fetch(`${url}/api/collections/${col}`, { headers: { Authorization: token } });
  const j = await r.json();
  console.log(`${col}: ${r.status === 200 ? "EXISTS" : "MISSING"} fields=${(j.schema || []).map((f) => f.name).join(",")}`);
}
