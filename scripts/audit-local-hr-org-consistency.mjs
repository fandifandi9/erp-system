/**
 * LOCAL/STAGING read-only org assignment consistency audit (Phase 35I-K-P1).
 * Run: npm run audit:local-hr-org-consistency
 *
 * Detects:
 * A. employee with >1 active assignment
 * B. position with N active assignments (informational multi-holder)
 * C. assignment company outside position scope (COMPANY mode mismatch)
 * D. orphan assignment (missing user/position/company)
 * E. stale holder_user vs active assignments
 * F. one-active rule violations (= A)
 *
 * Does NOT mutate data. Blocks production hosts.
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

function relId(raw) {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && raw.id) return String(raw.id);
  return "";
}

const { url, email, pass } = loadEnv();
if (!url || url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
  console.error("BLOCKED — local/staging only");
  process.exit(1);
}

async function main() {
  console.log("=== READ-ONLY org consistency audit (35I-K-P1) ===");
  console.log("PB:", url);

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
  const h = { Authorization: auth.token };

  async function all(name, filter) {
    const q = filter
      ? `?perPage=500&filter=${encodeURIComponent(filter)}`
      : "?perPage=500";
    const r = await fetch(`${url}/api/collections/${name}/records${q}`, { headers: h });
    if (!r.ok) return [];
    const d = await r.json();
    return d.items || [];
  }

  const col = await fetch(`${url}/api/collections/hr_employee_org_assignments`, { headers: h });
  if (!col.ok) {
    console.log("hr_employee_org_assignments missing — skip");
    process.exit(0);
  }
  const colJson = await col.json();
  const indexes = colJson.indexes || [];
  console.log(
    "one_active_index",
    indexes.some((ix) => String(ix).includes("idx_hr_org_assign_one_active_user"))
      ? "PRESENT"
      : "MISSING",
  );

  const assigns = await all("hr_employee_org_assignments", "is_active=true");
  const positions = await all("hr_org_positions");
  const posById = new Map(positions.map((p) => [p.id, p]));

  const byUser = {};
  const byPos = {};
  const orphans = [];
  const companyMismatch = [];

  for (const a of assigns) {
    const uid = relId(a.user);
    const pid = relId(a.org_position);
    const cid = relId(a.company);
    if (!uid || !pid || !cid) {
      orphans.push({ id: a.id, user: uid, position: pid, company: cid });
      continue;
    }
    byUser[uid] = byUser[uid] || [];
    byUser[uid].push({ id: a.id, company: cid, position: pid });
    byPos[pid] = byPos[pid] || [];
    byPos[pid].push({ id: a.id, user: uid, company: cid });

    const pos = posById.get(pid);
    if (!pos) {
      orphans.push({ id: a.id, reason: "missing_position", position: pid });
      continue;
    }
    const posCompany = relId(pos.company);
    if (posCompany && posCompany !== cid) {
      // COMPANY-mode style mismatch (always report; GROUP may be intentional)
      companyMismatch.push({
        id: a.id,
        assignmentCompany: cid,
        positionCompany: posCompany,
        positionId: pid,
      });
    }
  }

  const multiActive = Object.entries(byUser).filter(([, v]) => v.length > 1);
  const multiHolder = Object.entries(byPos).filter(([, v]) => v.length > 1);

  let emptyButHolder = 0;
  let filledButNoCache = 0;
  let staleMismatch = 0;
  for (const pos of positions) {
    const hid = relId(pos.holder_user);
    const actives = byPos[pos.id] || [];
    if (hid && actives.length === 0) emptyButHolder++;
    if (!hid && actives.length > 0) filledButNoCache++;
    if (hid && actives.length > 0 && !actives.some((a) => a.user === hid)) staleMismatch++;
  }

  console.log("A/F multi_active_users", multiActive.length);
  if (multiActive.length) console.log(JSON.stringify(multiActive.slice(0, 10), null, 2));
  console.log("B multi_holder_positions", multiHolder.length, "(informational OK)");
  console.log("C company_vs_position_mismatch", companyMismatch.length);
  if (companyMismatch.length) console.log(JSON.stringify(companyMismatch.slice(0, 10), null, 2));
  console.log("D orphans", orphans.length);
  if (orphans.length) console.log(JSON.stringify(orphans.slice(0, 10), null, 2));
  console.log(
    "E stale_holder_user",
    JSON.stringify({ emptyButHolder, filledButNoCache, staleMismatch }),
  );
  console.log("active_assignments", assigns.length);

  const fail =
    multiActive.length > 0 || orphans.length > 0 || emptyButHolder > 0 || staleMismatch > 0;
  console.log(fail ? "RESULT: ISSUES_FOUND" : "RESULT: OK");
  process.exit(fail ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
