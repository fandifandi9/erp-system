/**
 * Shared staging-only safety guards for HR Leave Wave 2B scripts.
 * Never import this into production-facing app code paths that target pb.serba.space.
 */

import fs from "fs";
import path from "path";

export const PRODUCTION_HOST_BLOCKLIST = [
  "pb.serba.space",
  "serba.space",
  "www.serba.space",
];

/** Explicit staging public hosts (Nginx UAT). Not production. */
export const STAGING_PUBLIC_HOST_ALLOWLIST = [
  "staging.serba.space",
  "pb-staging.serba.space",
];

export function loadEnvFile(name) {
  const p = path.join(process.cwd(), name);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

/** Load .env* then process.env wins. Includes .env.staging / .env.staging.local (gitignored). */
export function loadStagingEnv() {
  const fileEnv = {
    ...loadEnvFile(".env"),
    ...loadEnvFile(".env.local"),
    ...loadEnvFile(".env.staging"),
    ...loadEnvFile(".env.staging.local"),
  };
  return { ...fileEnv, ...process.env };
}

export function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/$/, "");
}

/**
 * Hard stop if target is production or equals NEXT_PUBLIC_POCKETBASE_URL.
 * Does not print secrets.
 */
export function assertStagingOnly(env, stagingUrl, { requireUrl = true } = {}) {
  const url = normalizeUrl(stagingUrl);
  if (!url) {
    if (!requireUrl) return { ok: false, reason: "missing POCKETBASE_STAGING_URL" };
    console.error("BLOCKED — set POCKETBASE_STAGING_URL (staging PocketBase only).");
    console.error("Example (SSH tunnel): POCKETBASE_STAGING_URL=http://127.0.0.1:8092");
    console.error("Never use https://pb.serba.space");
    process.exit(2);
  }

  const host = hostOf(url);
  if (!host) {
    console.error("BLOCKED — invalid POCKETBASE_STAGING_URL");
    process.exit(2);
  }

  // Allow explicit staging public hostnames (Phase 12B UAT).
  const hostNoPort = host.split(":")[0];
  const isAllowlistedStaging = STAGING_PUBLIC_HOST_ALLOWLIST.includes(hostNoPort);

  if (!isAllowlistedStaging) {
    // Exact production hosts only — do NOT treat all *.serba.space as production
    // (that would incorrectly block pb-staging.serba.space / staging.serba.space).
    if (PRODUCTION_HOST_BLOCKLIST.some((h) => hostNoPort === h)) {
      console.error("BLOCKED — refused production host:", host);
      console.error("Staging scripts never target pb.serba.space / serba.space.");
      process.exit(2);
    }
  }

  const primary = normalizeUrl(env.NEXT_PUBLIC_POCKETBASE_URL || "");
  if (primary && hostOf(primary) === host) {
    // Local SSH tunnel: Next dev and staging scripts both target 127.0.0.1:8092 — safe.
    let tunnelException = false;
    try {
      const u = new URL(url);
      const isLoopback = u.hostname === "127.0.0.1" || u.hostname === "localhost";
      tunnelException = isLoopback && u.port === "8092";
    } catch {
      tunnelException = false;
    }
    if (!tunnelException) {
      console.error(
        "BLOCKED — POCKETBASE_STAGING_URL equals NEXT_PUBLIC_POCKETBASE_URL (" + host + ")",
      );
      console.error("Use a separate staging instance (e.g. tunnel to 127.0.0.1:8092).");
      process.exit(2);
    }
  }

  // Port 8091 is production PB on the VPS — refuse even via tunnel misconfig.
  try {
    const u = new URL(url);
    if (u.port === "8091") {
      console.error("BLOCKED — port 8091 is production PocketBase. Use 8092 for staging.");
      process.exit(2);
    }
  } catch {
    /* already validated host */
  }

  return { ok: true, url, host };
}

/**
 * Staging admin must be explicit STAGING_* vars — never silently reuse production ADMIN_*.
 */
export function requireStagingAdmin(env) {
  const email = String(env.POCKETBASE_STAGING_ADMIN_EMAIL || "").trim();
  const password = String(env.POCKETBASE_STAGING_ADMIN_PASSWORD || "").trim();

  if (!email || !password) {
    console.error("BLOCKED — require POCKETBASE_STAGING_ADMIN_EMAIL and POCKETBASE_STAGING_ADMIN_PASSWORD.");
    console.error("Do not fall back to production POCKETBASE_ADMIN_* credentials.");
    process.exit(2);
  }

  const prodEmail = String(env.POCKETBASE_ADMIN_EMAIL || "").trim();
  const prodPass = String(env.POCKETBASE_ADMIN_PASSWORD || "").trim();

  if (prodEmail && email.toLowerCase() === prodEmail.toLowerCase()) {
    console.error("BLOCKED — staging admin email matches POCKETBASE_ADMIN_EMAIL (production).");
    console.error("Create a staging-only admin on the VPS.");
    process.exit(2);
  }
  if (prodPass && password === prodPass) {
    console.error("BLOCKED — staging admin password matches POCKETBASE_ADMIN_PASSWORD (production).");
    console.error("Use a unique staging-only password.");
    process.exit(2);
  }

  return { email, password };
}

export function requireStagingSeedPassword(env) {
  const password = String(env.STAGING_SEED_PASSWORD || "").trim();
  if (!password) {
    console.error("BLOCKED — require STAGING_SEED_PASSWORD (fixture users; no hardcoded passwords).");
    process.exit(2);
  }
  if (password.length < 8) {
    console.error("BLOCKED — STAGING_SEED_PASSWORD must be at least 8 characters (PocketBase).");
    process.exit(2);
  }
  const prodPass = String(env.POCKETBASE_ADMIN_PASSWORD || "").trim();
  const stagingAdminPass = String(env.POCKETBASE_STAGING_ADMIN_PASSWORD || "").trim();
  if (prodPass && password === prodPass) {
    console.error("BLOCKED — STAGING_SEED_PASSWORD must not equal production admin password.");
    process.exit(2);
  }
  if (stagingAdminPass && password === stagingAdminPass) {
    console.error("BLOCKED — STAGING_SEED_PASSWORD must not equal staging admin password.");
    console.error("Use a separate password for dummy fixture users.");
    process.exit(2);
  }
  return password;
}

export function printStagingUsage(scriptName) {
  console.error(`
Usage (${scriptName}):
  # 1) SSH tunnel (from workstation) — staging stays on VPS 127.0.0.1:8092
  ssh -L 8092:127.0.0.1:8092 <user>@<vps>

  # 2) Server-local or gitignored env (never commit):
  #    .env.staging.local  OR export vars in shell

  POCKETBASE_STAGING_URL=http://127.0.0.1:8092
  POCKETBASE_STAGING_ADMIN_EMAIL=<staging-only-admin>
  POCKETBASE_STAGING_ADMIN_PASSWORD=<staging-only-password>
  STAGING_SEED_PASSWORD=<fixture-users-password>

  # Optional:
  STAGING_SEED_INCLUDE_COMPANY_B=1
  STAGING_EMAIL_DOMAIN=staging.serba.test
  STAGING_EXPECT_MODE=baseline   # or locked (after write-lock)

  # 3) Run from repo root (NOT from /var/www/pocketbase-erp-staging):
  npm run seed:hr-leave-staging
  npm run test:hr-leave-pb-direct
`);
}
