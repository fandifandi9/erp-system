/**
 * Phase 35I-H — Recruitment ↔ dynamic organization structure (static checks + pure authority).
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

console.log("=== PHASE 35I-H RECRUITMENT ↔ ORG STRUCTURE ===\n");

console.log("CASE — Static role list removed from recruitment UI");
{
  const form = read("components/hr/HrEmployeeOnboardForm.tsx");
  assert(!form.includes("EMPLOYEE_ROLE_PRESETS"), "form does not import static presets for jabatan");
  assert(!form.includes("rolePresetId"), "Role User state removed");
  assert(form.includes("org_position_id") || form.includes("orgPositionId"), "submits org_position_id");
  assert(form.includes("Jabatan / Posisi"), "Jabatan/Posisi label");
  assert(form.includes("recruitable"), "loads recruitable positions");
  assert(!form.includes("HrManagerPickerField"), "no free-form atasan picker");
  assert(form.includes("parentVacant") || form.includes("posisi induk"), "parent vacant messaging");
  assert(form.includes("max-w-5xl") || form.includes("lg:grid-cols-2"), "2-column layout");
}

console.log("\nCASE — Recruitable positions server + API");
{
  assert(exists("lib/hr/recruitable-positions-server.ts"), "recruitable server helper");
  const srv = read("lib/hr/recruitable-positions-server.ts");
  assert(srv.includes("appointmentEligible"), "separates appointment eligibility");
  assert(srv.includes("assertRecruitmentTargetPosition"), "recruitment target assert");
  assert(srv.includes("assertAppointablePositionForCreate") || srv.includes("assertRecruitablePositionForCreate"), "appointment assert");
  assert(srv.includes("ORG_APPOINTMENT_DENIED") || srv.includes("canAssignPositionHolder"), "appointment uses org authority");
  assert(srv.includes("ORG_RECRUIT_COMPANY_MISMATCH") || srv.includes("COMPANY"), "COMPANY mismatch");
  assert(exists("app/api/hr/org-positions/recruitable/route.ts"), "recruitable API route");
  assert(
    read("app/api/hr/org-positions/recruitable/route.ts").includes("serverListRecruitablePositions"),
    "API calls helper",
  );
}

console.log("\nCASE — Onboarding wires org assignment");
{
  const onboard = read("lib/hr/employee-onboarding-server.ts");
  assert(onboard.includes("org_position_id"), "requires org_position_id");
  assert(onboard.includes("assertRecruitmentTargetPosition"), "validates recruitment target");
  assert(onboard.includes("createOrgAssignment"), "may create org assignment when appointable");
  assert(onboard.includes("appointmentPending") || onboard.includes("appointment_pending"), "pending appointment when no authority");
  assert(onboard.includes("deriveSuperiorFromPosition"), "derived superior");
  assert(onboard.includes('|| "staff"') || onboard.includes('"staff"'), "default ERP preset staff");
  assert(!onboard.includes("manager_user_id"), "no free manager on create");
  const route = read("app/api/hr/employees/route.ts");
  assert(route.includes("org_position_id"), "POST accepts org_position_id");
  assert(!route.includes("manager_user_id"), "POST no longer passes free manager");
}

console.log("\nCASE — createOrgAssignment uses canAssignPositionHolder (subtree)");
{
  const asg = read("lib/hr/org-assignment-server.ts");
  assert(asg.includes("canAssignPositionHolder"), "assignment authority aligned");
  assert(asg.includes("ORG_ASSIGNMENT_ONE_ACTIVE"), "one-active preserved");
}

console.log("\nCASE — Pure hierarchy authority (inline)");
{
  // Mirror canAssignPositionHolder / positionsUnderOrgAuthority rules (no hard-coded titles).
  const flat = [
    { id: "dir", parentPositionId: null, holderUserId: "u-dir" },
    { id: "mfin", parentPositionId: "dir", holderUserId: "u-mfin" },
    { id: "sfin", parentPositionId: "mfin", holderUserId: null },
    { id: "mhr", parentPositionId: "dir", holderUserId: "u-mhr" },
    { id: "shr", parentPositionId: "mhr", holderUserId: null },
  ];

  function descendants(rootId) {
    const kids = new Map();
    for (const p of flat) {
      if (!p.parentPositionId) continue;
      const arr = kids.get(p.parentPositionId) || [];
      arr.push(p.id);
      kids.set(p.parentPositionId, arr);
    }
    const out = new Set();
    const stack = [...(kids.get(rootId) || [])];
    while (stack.length) {
      const id = stack.pop();
      if (out.has(id)) continue;
      out.add(id);
      for (const c of kids.get(id) || []) stack.push(c);
    }
    return out;
  }

  function canAssign(actorId, isOwner, positionId) {
    if (isOwner) return true;
    const pos = flat.find((p) => p.id === positionId);
    if (!pos || !pos.parentPositionId) return false;
    const parent = flat.find((p) => p.id === pos.parentPositionId);
    if (parent?.holderUserId === actorId) return true;
    const held = flat.filter((p) => p.holderUserId === actorId).map((p) => p.id);
    for (const h of held) {
      if (descendants(h).has(positionId)) return true;
    }
    return false;
  }

  assert(canAssign("owner", true, "dir"), "CASE1/2 Owner can fill any incl root");
  assert(canAssign("u-dir", false, "sfin"), "CASE3 Director can fill subordinate Staff Finance");
  assert(!canAssign("u-mfin", false, "dir"), "CASE4 Manager cannot fill ancestor");
  assert(!canAssign("u-mfin", false, "mhr"), "CASE5 Manager Finance cannot fill peer Manager HR");
  assert(!canAssign("u-mfin", false, "dir"), "CASE6 non-Owner cannot fill root");
  assert(canAssign("u-mfin", false, "sfin"), "CASE7/12 Manager Finance can fill own child vacant");
  assert(!canAssign("u-mfin", false, "shr"), "CASE8 Manager Finance cannot fill under Manager HR");
  assert(canAssign("u-mhr", false, "shr"), "CASE10 Manager HR can fill Staff HR");
  assert(!canAssign("u-shr", false, "shr"), "CASE11 Staff without hold cannot assign (no seat)");
  assert(!canAssign("hr-full", false, "sfin"), "CASE11 HR FULL without org seat cannot assign");
}

console.log("\nCASE — Presets file kept for ERP access compatibility");
{
  assert(exists("lib/hr/employee-role-presets.ts"), "presets file retained");
  assert(
    read("lib/hr/employee-role-presets.ts").includes("EMPLOYEE_ROLE_PRESETS"),
    "legacy presets still exist for capability mapping",
  );
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
