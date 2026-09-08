/**
 * Start Next.js against staging PocketBase with staging-only admin credentials.
 * Staging URL only — refuses production hosts.
 *
 * Usage: node scripts/run-next-staging-dev.mjs
 */
import { spawn } from "child_process";
import {
  assertStagingOnly,
  loadStagingEnv,
  requireStagingAdmin,
} from "./lib/staging-guard.mjs";

const env = loadStagingEnv();
const { url } = assertStagingOnly(env, env.POCKETBASE_STAGING_URL);
const stagingAdmin = requireStagingAdmin(env);

const port = String(env.STAGING_NEXT_PORT || "3001");
const childEnv = {
  ...process.env,
  NEXT_PUBLIC_POCKETBASE_URL: url,
  POCKETBASE_URL: url,
  POCKETBASE_ADMIN_EMAIL: stagingAdmin.email,
  POCKETBASE_ADMIN_PASSWORD: stagingAdmin.password,
  PORT: port,
};

console.log("Starting Next staging on port", port, "PB", url);
console.log("Using POCKETBASE_STAGING_ADMIN_* as server admin (not production).");

const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev", "--", "-p", port],
  { env: childEnv, stdio: "inherit", shell: true },
);

child.on("exit", (code) => process.exit(code ?? 1));
