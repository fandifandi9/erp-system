/**
 * LOCAL audit: multi-active org assignments (Phase 35I-G).
 * Read-only — does not mutate data.
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
if (!url || url.includes("serba.space")) {
  console.error("BLOCKED — local only");
  process.exit(1);
}

async function main() {
  let auth = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password: pass }),
  }).then((r) => r.json());
  if (!auth.token) {
    auth = await fetch(`${url}/api/admins/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: email, password: pass }),
    }).then((r) => r.json());
  }
  if (!auth.token) throw new Error("auth failed");

  const col = await fetch(`${url}/api/collections/hr_employee_org_assignments`, {
    headers: { Authorization: auth.token },
  });
  if (!col.ok) {
    console.log("hr_employee_org_assignments missing — no conflicts");
    return;
  }

  const res = await fetch(
    `${url}/api/collections/hr_employee_org_assignments/records?perPage=500&filter=${encodeURIComponent("is_active=true")}`,
    { headers: { Authorization: auth.token } },
  );
  const data = await res.json();
  const items = data.items || [];
  const byUser = {};
  for (const a of items) {
    const u = typeof a.user === "string" ? a.user : a.user?.id;
    if (!u) continue;
    byUser[u] = byUser[u] || [];
    byUser[u].push({
      id: a.id,
      company: typeof a.company === "string" ? a.company : a.company?.id,
      position: typeof a.org_position === "string" ? a.org_position : a.org_position?.id,
    });
  }
  const conflicts = Object.entries(byUser).filter(([, v]) => v.length > 1);
  console.log("active_assignments", items.length);
  console.log("users_with_active", Object.keys(byUser).length);
  console.log("multi_active_conflicts", conflicts.length);
  if (conflicts.length) {
    console.log("CONFLICTS (first 20):");
    console.log(JSON.stringify(conflicts.slice(0, 20), null, 2));
  } else {
    console.log("OK — no multi-active user conflicts");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
