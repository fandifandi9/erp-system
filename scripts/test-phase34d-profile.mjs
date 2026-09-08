/**
 * Phase 34D — Profile & Account UX Hardening tests (local).
 * Run: npm run test:phase34d-profile
 */

import fs from "fs";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// ─── mirrors lib/hr/profile-primary-entity.ts ───────────────────────────────

function resolvePrimaryAdministrativeEntity(memberships) {
  const active = memberships.filter((r) => {
    const c = r.expand?.company;
    return c ? c.is_active !== false : true;
  });
  if (active.length === 0) {
    return { status: "none", label: "Belum ditentukan", membership_count: 0 };
  }
  if (active.length === 1) {
    const c = active[0].expand?.company;
    return {
      status: "resolved",
      label: c?.company_name || "—",
      entity_type: c?.entity_type,
      membership_count: 1,
    };
  }
  const primaries = active.filter((r) => r.is_primary === true);
  if (primaries.length === 1) {
    const c = primaries[0].expand?.company;
    return {
      status: "resolved",
      label: c?.company_name || "—",
      entity_type: c?.entity_type,
      membership_count: active.length,
    };
  }
  if (primaries.length === 0) {
    return { status: "undetermined", label: "Belum ditentukan", membership_count: active.length };
  }
  return { status: "ambiguous", label: "Data entitas tidak valid — hubungi HR", membership_count: active.length };
}

// ─── mirrors lib/hr/avatar-validate.ts limits ─────────────────────────────

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const JPEG = [0xff, 0xd8, 0xff];

function sniffJpeg(bytes) {
  return bytes.length >= 3 && JPEG.every((b, i) => bytes[i] === b);
}

function validateAvatarSize(size) {
  return size <= AVATAR_MAX_BYTES;
}

// ─── mirrors profile-self-service restricted fields ───────────────────────

const PROFILE_RESTRICTED_FIELDS = ["nik", "npwp", "salary", "manager", "primary_entity_id", "company"];
const PROFILE_SELF_SERVICE_FIELDS = ["phone", "address", "date_of_birth", "bio"];

function rejectRestricted(body) {
  for (const key of PROFILE_RESTRICTED_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) return false;
  }
  return true;
}

console.log("\n=== Phase 34D Profile & Account Tests ===\n");

console.log("Primary administrative entity resolution");
{
  assert(
    resolvePrimaryAdministrativeEntity([
      {
        is_primary: true,
        expand: { company: { company_name: "SERBA Local", entity_type: "PT", is_active: true } },
      },
    ]).status === "resolved",
    "single membership → resolved",
  );
  assert(
    resolvePrimaryAdministrativeEntity([
      {
        is_primary: false,
        expand: { company: { company_name: "A", entity_type: "PT", is_active: true } },
      },
    ]).label === "A",
    "single membership without is_primary still resolved",
  );
  assert(
    resolvePrimaryAdministrativeEntity([
      {
        is_primary: false,
        expand: { company: { company_name: "LOCAL", entity_type: "PT", is_active: true } },
      },
      {
        is_primary: true,
        expand: { company: { company_name: "SDI", entity_type: "PT", is_active: true } },
      },
    ]).label === "SDI",
    "multiple membership + one primary",
  );
  assert(
    resolvePrimaryAdministrativeEntity([]).status === "none",
    "no membership → none / Belum ditentukan",
  );
  assert(
    resolvePrimaryAdministrativeEntity([
      { is_primary: false, expand: { company: { company_name: "A", is_active: true } } },
      { is_primary: false, expand: { company: { company_name: "B", is_active: true } } },
    ]).status === "undetermined",
    "multi without primary → undetermined",
  );
  assert(
    resolvePrimaryAdministrativeEntity([
      { is_primary: true, expand: { company: { company_name: "A", is_active: true } } },
      { is_primary: true, expand: { company: { company_name: "B", is_active: true } } },
    ]).status === "ambiguous",
    "dual primary → ambiguous fail closed",
  );
}

console.log("Avatar validation");
{
  assert(validateAvatarSize(1024), "small file ok");
  assert(!validateAvatarSize(AVATAR_MAX_BYTES + 1), "oversized rejected");
  assert(sniffJpeg(new Uint8Array(JPEG)), "jpeg magic bytes");
  assert(!sniffJpeg(new Uint8Array([0, 0, 0])), "invalid bytes rejected");
}

console.log("Self-service field security");
{
  assert(rejectRestricted({ phone: "081" }), "allowlisted fields ok");
  assert(!rejectRestricted({ salary: 100 }), "salary blocked");
  assert(!rejectRestricted({ nik: "x" }), "nik blocked");
  assert(!rejectRestricted({ primary_entity_id: "x" }), "entity change blocked from profile");
  assert(PROFILE_SELF_SERVICE_FIELDS.length === 4, "exactly 4 self-service fields");
}

console.log("Artifacts & server-authoritative flow");
{
  const files = [
    "lib/hr/profile-primary-entity.ts",
    "lib/hr/profile-mutation-server.ts",
    "lib/hr/avatar-validate.ts",
    "lib/hr/profile-avatar-url.ts",
    "app/api/profile/self/route.ts",
    "app/api/profile/self/avatar/route.ts",
    "components/EmployeeSelfProfile.tsx",
    "scripts/migrate-local-hr-phase34d-profile-avatar.mjs",
  ];
  for (const f of files) assert(fs.existsSync(f), `exists ${f}`);

  const profileComponent = fs.readFileSync("components/EmployeeSelfProfile.tsx", "utf8");
  assert(profileComponent.includes("fetchSelfProfileApi"), "profile page uses GET /api/profile/self");
  assert(!profileComponent.includes("ensureAndSyncProfile"), "no direct PB profile load on web");
  assert(!profileComponent.includes('pb.collection("profiles")'), "no client PB profile mutation");
  assert(profileComponent.includes("uploadSelfAvatarApi"), "avatar via server API");

  const mutationServer = fs.readFileSync("lib/hr/profile-mutation-server.ts", "utf8");
  assert(mutationServer.includes("validateAvatarBytes"), "server avatar validation");
  assert(mutationServer.includes("fetchPrimaryAdministrativeEntityForUser"), "primary entity on GET");
  assert(mutationServer.includes("buildProfileAvatarUrl"), "avatar URL with cache bust");

  const selfService = fs.readFileSync("lib/hr/profile-self-service.ts", "utf8");
  assert(!selfService.includes("nik:"), "DTO does not expose nik in buildSelfProfileDto safe fields check");
  assert(selfService.includes("primary_entity"), "employment.primary_entity in DTO");
}

console.log("Attendance unchanged (static)");
{
  const scope = fs.readFileSync("lib/hr/employment-scope.ts", "utf8");
  assert(scope.includes("is_primary"), "attendance still uses is_primary membership");
  assert(!scope.includes("active_company"), "employment-scope no active_company fallback");
}

console.log(`\nPhase 34D: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
