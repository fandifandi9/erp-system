/**
 * Phase 35I — access architecture foundation tests.
 * Run: npm run test:phase35i-access-architecture
 */

import fs from "fs";
import { runPhase35iResolverTests } from "./phase35i-resolver-tests.mjs";

const root = process.cwd();
let passed = 0;
let failed = 0;

function read(rel) {
  return fs.readFileSync(`${root}/${rel}`, "utf8");
}

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("=== PHASE 35I ACCESS ARCHITECTURE TESTS ===\n");

// Structure
assert(fs.existsSync("lib/access/types.ts"), "lib/access/types.ts");
assert(fs.existsSync("lib/access/module-registry.ts"), "module registry");
assert(fs.existsSync("lib/access/resolve-effective-access.ts"), "effective access resolver");
assert(fs.existsSync("lib/access/module-assignments-server.ts"), "PB loader");
assert(fs.existsSync("lib/access/entity-scope.ts"), "entity scope");
assert(fs.existsSync("lib/access/desk-config.ts"), "desk config boundary");
assert(fs.existsSync("scripts/migrate-local-hr-phase35i.mjs"), "migration script");

const rbac = read("lib/rbac.ts");
assert(rbac.includes("module_web_paths"), "rbac merges additive module paths");
assert(rbac.includes("getAllowedPathsForUser"), "getAllowedPathsForUser preserved");

const session = read("app/api/auth/session/route.ts");
assert(session.includes("enrichUserWithAccessContext"), "session enriches module access");

const resolver = read("lib/workspace/resolve-workspace.ts");
assert(resolver.includes("isSessionModuleAccessEnriched"), "desk uses SSOT when enriched");
assert(resolver.includes("resolveDeskModulesFromAccessContext"), "desk config resolver");

const registry = read("lib/access/module-registry.ts");
assert(registry.includes('"hr"') && registry.includes('"finance"'), "HR and Finance modules");
assert(registry.includes("EMPLOYEE_CAPABILITIES"), "uses existing employee capabilities");
assert(!registry.includes("finance.journal"), "no fake finance permissions");

const assignServer = read("lib/access/module-assignments-server.ts");
assert(assignServer.includes("MODULE_ASSIGNMENTS_COLLECTION"), "assignments collection constant");
assert(assignServer.includes("loadModuleAssignmentsForUser"), "load assignments");

assert(!read("lib/access/resolve-effective-access.ts").includes('role === "hr"'), "no hardcoded hr role");
assert(!read("lib/access/module-registry.ts").includes("@gmail.com"), "no email auth");

// Backward compatibility
assert(read("lib/access/legacy-paths.ts").includes("resolveLegacyAllowedPaths"), "legacy paths extracted");
assert(read("lib/access/module-assignments-server.ts").includes("return []"), "empty assignments fail-safe");

// Desk is not auth layer
const desk = read("lib/access/desk-config.ts");
assert(desk.includes("canAccess"), "desk items still filtered by canAccess");
assert(desk.includes("deskEnabled"), "desk respects desk_enabled flag");

// Resolver unit tests
console.log("\n--- Resolver unit tests ---\n");
const resolverResults = runPhase35iResolverTests();
for (const msg of resolverResults.messages) console.log(msg);
passed += resolverResults.passed;
failed += resolverResults.failed;

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
