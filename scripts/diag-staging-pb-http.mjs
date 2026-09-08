/**
 * Diagnose staging PB HTTP from Node (tunnel-safe http vs undici fetch).
 * Does not apply schema. Does not print secrets.
 *
 *   node scripts/diag-staging-pb-http.mjs
 */
import {
  assertStagingOnly,
  loadStagingEnv,
  requireStagingAdmin,
} from "./lib/staging-guard.mjs";
import { stagingJson } from "./lib/staging-http.mjs";

const env = loadStagingEnv();
const { url: TARGET } = assertStagingOnly(env, env.POCKETBASE_STAGING_URL);
const admin = requireStagingAdmin(env);

console.log("TARGET", TARGET);

async function tryFetch(label, method, path, body) {
  try {
    const res = await fetch(`${TARGET}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    console.log(`[undici ${label}] HTTP ${res.status} body=${text.slice(0, 80)}`);
  } catch (e) {
    console.log(`[undici ${label}] ERR ${e.cause?.code || e.code || e.message}`);
  }
}

async function tryHttp(label, method, path, body) {
  try {
    const res = await stagingJson(method, `${TARGET}${path}`, {
      body,
      label,
      retries: 2,
    });
    console.log(`[http ${label}] HTTP ${res.status} body=${JSON.stringify(res.json).slice(0, 80)}`);
    return res;
  } catch (e) {
    console.log(`[http ${label}] ERR ${e.code || e.message}`);
    return null;
  }
}

await tryFetch("health", "GET", "/api/health");
await tryHttp("health", "GET", "/api/health");

await tryFetch("admin-auth", "POST", "/api/admins/auth-with-password", {
  identity: admin.email,
  password: admin.password,
});
const auth = await tryHttp("admin-auth", "POST", "/api/admins/auth-with-password", {
  identity: admin.email,
  password: admin.password,
});

if (auth?.json?.token) {
  const cols = await stagingJson("GET", `${TARGET}/api/collections?perPage=5`, {
    token: auth.json.token,
    label: "list collections",
  });
  console.log(`[http collections] HTTP ${cols.status} items=${(cols.json.items || []).length}`);
}
