import PocketBase from "pocketbase";
import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const url = env.NEXT_PUBLIC_POCKETBASE_URL.replace(/\/$/, "");
const pb = new PocketBase(url);
const res = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
});
const auth = await res.json();
pb.authStore.save(auth.token, auth.admin ?? {});
const pos = await pb.collection("biz_purchase_orders").getFullList({ requestKey: null });
for (const p of pos) {
  if (!p.status) {
    await pb.collection("biz_purchase_orders").update(p.id, { status: "draft" });
    console.log("fixed", p.po_no, "-> draft");
  } else {
    console.log(p.po_no, "status=", p.status);
  }
}
