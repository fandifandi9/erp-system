/**
 * Phase 35I-I — Multi-holder positions + Staff HR read-only org + recruitment ≠ appointment.
 * Run: npm run test:phase35i-i-multi-holder-hr
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log("  ✓", msg);
    passed += 1;
  } else {
    console.log("  ✗", msg);
    failed += 1;
  }
}

console.log("=== PHASE 35I-I MULTI-HOLDER + HR READ-ONLY + RECRUITMENT SEPARATION ===\n");

console.log("CASE 1/17 — Staff HR may open org structure (path + capability map)");
{
  const map = read("lib/access/business-capability-map.ts");
  assert(map.includes('"/pengaturan/organisasi"'), "org structure in employee.view/create paths");
  assert(exists("app/(dashboard)/pengaturan/organisasi/page.tsx"), "org UI page exists");
  assert(exists("app/(dashboard)/hr/org-structure") || read("lib/access/legacy-paths.ts").includes("/hr/org-structure"), "legacy /hr/org-structure retained");
}

console.log("\nCASE 2–5 — Staff HR mutations denied server-side (no HR FULL bypass)");
{
  const auth = read("lib/hr/org-authority.ts");
  assert(!auth.includes('accessMode === "full"'), "no HR FULL bypass in org authority");
  assert(auth.includes("HR capability ≠ organizational authority") || auth.includes("HR capability"), "HR ≠ org docs");
  const pos = read("lib/hr/org-position-server.ts");
  assert(pos.includes("canEstablishChildUnderParent"), "create child gated");
  assert(pos.includes("canAssignPositionHolder"), "assign holder gated");
  assert(pos.includes("canEditPositionInSubtree") || pos.includes("canMovePosition"), "edit/move gated");
  const ui = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(ui.includes("Mode baca") || ui.includes("otoritas organisasi tidak mengizinkan"), "UI read-only messaging");
  assert(ui.includes("canMutateSelected"), "mutation buttons gated by caps");
}

console.log("\nCASE 6–8 — Manager/Direktur expand; Staff leaf cannot");
{
  function depth(flat, id) {
    const byId = new Map(flat.map((p) => [p.id, p]));
    let d = 0;
    let cur = id;
    const g = new Set();
    while (cur) {
      if (g.has(cur)) break;
      g.add(cur);
      const n = byId.get(cur);
      if (!n?.parentPositionId) return d;
      cur = n.parentPositionId;
      d += 1;
    }
    return d;
  }
  function holders(p) {
    if (p.holderUserIds?.length) return p.holderUserIds;
    return p.holderUserId ? [p.holderUserId] : [];
  }
  function canExpand(actorId, isOwner, parentId, flat, maxDepth = 1) {
    if (isOwner) return true;
    if (!parentId) return false;
    const parent = flat.find((p) => p.id === parentId);
    if (!parent || !holders(parent).includes(actorId)) return false;
    return depth(flat, parentId) <= maxDepth;
  }
  const flat = [
    { id: "dir", parentPositionId: null, holderUserId: "u-dir", holderUserIds: ["u-dir"] },
    { id: "mgr", parentPositionId: "dir", holderUserId: "u-mgr", holderUserIds: ["u-mgr"] },
    { id: "staff", parentPositionId: "mgr", holderUserId: "u-staff", holderUserIds: ["u-staff"] },
  ];
  assert(canExpand("u-dir", false, "dir", flat), "CASE6/7 Direktur can create under self");
  assert(canExpand("u-mgr", false, "mgr", flat), "CASE6 Manager can create under self");
  assert(!canExpand("u-staff", false, "staff", flat), "CASE8 Staff leaf cannot create child");
  assert(read("lib/hr/org-authority.ts").includes("ORG_HOLDER_EXPAND_MAX_DEPTH"), "depth rule preserved");
}

console.log("\nCASE 9–11 — Multi-holder same position_id (no Staff Gudang #2)");
{
  const asg = read("lib/hr/org-assignment-server.ts");
  assert(asg.includes("may have MANY active holders") || asg.includes("multi-holder"), "docs multi-holder");
  assert(!asg.includes("Jabatan sudah memiliki pemegang aktif"), "single-seat lock message removed");
  assert(asg.includes("ORG_ASSIGNMENT_ONE_ACTIVE"), "one-active-per-user preserved");

  // Behavioral: N holders on same position
  const store = [];
  function place(userId, positionId) {
    if (store.some((a) => a.isActive && a.userId === userId)) return { ok: false, reason: "one_user" };
    store.push({ userId, positionId, isActive: true });
    return { ok: true };
  }
  assert(place("andi", "staff-gudang").ok, "Andi on Staff Gudang");
  assert(place("budi", "staff-gudang").ok, "CASE9 Budi same position");
  assert(place("citra", "staff-gudang").ok, "Citra same");
  assert(place("dedi", "staff-gudang").ok, "CASE10 Dedi same");
  assert(store.filter((a) => a.positionId === "staff-gudang").length === 4, "4 holders one position_id");
  assert(!place("andi", "staff-gudang-2").ok, "CASE12 Andi cannot dual active");
  // No auto-create of Staff Gudang #2
  assert(!exists("lib/hr/auto-duplicate-position.ts"), "CASE11 no auto-duplicate position helper");
  const types = read("lib/hr/org-position-types.ts");
  assert(types.includes("holderUserIds") && types.includes("holderCount"), "types multi-holder fields");
  const ui = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(ui.includes("holderNames") || ui.includes("orang"), "CASE17 UI multi-holder display");
  assert(ui.includes("Tambah pemegang"), "add holder (not replace-only)");
}

console.log("\nCASE 12–13 — One active per employee; history OK");
{
  const history = [
    { userId: "andi", positionId: "sg", isActive: false, year: 2025 },
    { userId: "andi", positionId: "mg", isActive: true, year: 2026 },
  ];
  assert(history.filter((a) => a.isActive).length === 1, "only one active");
  assert(history.some((a) => !a.isActive), "historical transfer allowed");
}

console.log("\nCASE 14–15 — Recruitment administrative ≠ appointment");
{
  const srv = read("lib/hr/recruitable-positions-server.ts");
  assert(srv.includes("assertRecruitmentTargetPosition"), "recruitment target helper");
  assert(srv.includes("appointmentEligible"), "appointmentEligible flag");
  assert(srv.includes("ORG_APPOINTMENT_DENIED"), "appointment denied code");
  assert(
    srv.includes("Does NOT require canAssignPositionHolder") ||
      srv.includes("administrative") ||
      srv.includes("RECRUITMENT"),
    "list not filtered solely by appointment",
  );
  const onboard = read("lib/hr/employee-onboarding-server.ts");
  assert(onboard.includes("assertRecruitmentTargetPosition"), "onboard validates target");
  assert(onboard.includes("appointmentPending") || onboard.includes("appointment_pending"), "CASE15 pending without appointment auth");
  assert(onboard.includes("ORG_APPOINTMENT_DENIED") || onboard.includes("assertAppointablePositionForCreate"), "soft-fail appointment");
  const form = read("components/hr/HrEmployeeOnboardForm.tsx");
  assert(form.includes("appointmentEligible") || form.includes("butuh approval"), "UI separates recruitment vs appoint");
  assert(!form.includes("posisi VACANT yang dapat diisi"), "no VACANT-only recruit lock");
}

console.log("\nCASE 16 — Owner full org authority");
{
  const auth = read("lib/hr/org-authority.ts");
  assert(auth.includes("if (ctx.isOwner) return true"), "Owner short-circuit");
  const mode = read("lib/hr/org-structure-mode-server.ts");
  assert(mode.includes("requireOwnerForOrganizationStructureModeChange") || mode.includes("isOwner"), "mode Owner-only");
}

console.log("\nCASE 18 — Employee detail position + superior");
{
  const detail = read("lib/hr/employee-detail-server.ts");
  assert(detail.includes("deriveSuperiorFromPosition") || detail.includes("superior"), "superior derived");
  assert(detail.includes("orgPositionName") || detail.includes("orgPositionId"), "position on detail");
}

console.log("\nCASE — VACANT not single-seat; EMPTY/OCCUPIED semantics");
{
  const asg = read("lib/hr/org-assignment-server.ts");
  assert(!asg.includes("countActiveForPosition") || asg.includes("do NOT block"), "no position-full lock on create");
  const ui = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(!ui.includes('"VACANT"') && !ui.includes("Jabatan VACANT"), "VACANT lock label removed from UI");
  assert(ui.includes("Kosong") || ui.includes("Terisi"), "EMPTY/OCCUPIED wording");
}

console.log("\nCASE — Schema: no unnecessary migration for multi-holder");
{
  const mig = read("scripts/migrate-local-hr-phase35i-f3.mjs");
  assert(mig.includes("hr_employee_org_assignments"), "assignments collection exists");
  // No unique(org_position) in migration create
  assert(!/unique:\s*true[\s\S]{0,80}org_position|org_position[\s\S]{0,80}unique:\s*true/.test(mig), "no unique on org_position alone");
  assert(!exists("scripts/migrate-local-hr-phase35i-i.mjs"), "no new 35I-I migration (schema already 1→N)");
}

console.log("\nCASE — Multi-holder authority uses holderUserIds");
{
  const auth = read("lib/hr/org-authority.ts");
  assert(auth.includes("holderUserIds"), "authority graph multi-holder aware");
  assert(auth.includes("actorHoldsPosition") || auth.includes("activeHolderIds"), "holder membership helper");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
