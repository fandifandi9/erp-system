/**
 * Audit API routes — auth patterns & public endpoints.
 * Run: npm run audit:api-routes
 * Output: docs/API_ROUTE_AUDIT.md
 */
import fs from "fs";
import path from "path";

const apiRoot = path.join(process.cwd(), "app", "api");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

const AUTH_PATTERNS = [
  { re: /getApiAuthUser/, label: "getApiAuthUser" },
  { re: /assertShareAccess/, label: "assertShareAccess" },
  { re: /requireCatalogAccess|requirePembelianApiUser|requirePenjualanApiUser|requirePenjualanOrWmsApiUser|requirePosApiUser|requireInventoryAccess|requireInventorySupervisorAccess|requireInventoryPostAccess|requireGudangApiUser/, label: "module api-auth" },
  { re: /from "@\/app\/api\/email\/send\/route"/, label: "delegates to protected route" },
  { re: /getInventoryAdminPb\(\)/, label: "admin-only (implicit)" },
  { re: /requireRole|canAccess|InventoryApiError/, label: "role/permission helper" },
];

const PUBLIC_OK = new Set([
  "/api/health",
  "/api/auth/session",
]);

const routes = walk(apiRoot).sort();

const rows = [];

for (const file of routes) {
  const rel = file.replace(process.cwd(), "").replace(/\\/g, "/");
  const routePath = rel
    .replace(/^\/app\/api/, "/api")
    .replace(/\/route\.ts$/, "")
    .replace(/\/\[([^\]]+)\]/g, "/:$1");

  const src = fs.readFileSync(file, "utf8");
  const methods = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]);
  if (!methods.length) continue;

  const authHits = AUTH_PATTERNS.filter((p) => p.re.test(src)).map((p) => p.label);
  const isPublicOk = PUBLIC_OK.has(routePath);
  const hasAuth = authHits.length > 0;
  const status = isPublicOk ? "PUBLIC (intentional)" : hasAuth ? "PROTECTED" : "REVIEW";

  if (/debug/i.test(routePath) || /debug/i.test(src)) {
    rows.push({ routePath, methods, status: "DEBUG — DISABLE", authHits });
    continue;
  }

  rows.push({ routePath, methods, status, authHits });
}

const review = rows.filter((r) => r.status === "REVIEW");
const lines = [
  "# API Route Audit — SERBA ERP",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Summary",
  "",
  `- Total routes: ${rows.length}`,
  `- Protected: ${rows.filter((r) => r.status === "PROTECTED").length}`,
  `- Public (intentional): ${rows.filter((r) => r.status === "PUBLIC (intentional)").length}`,
  `- Needs review: ${review.length}`,
  `- Debug flagged: ${rows.filter((r) => r.status === "DEBUG — DISABLE").length}`,
  "",
  "## Routes needing review (no auth pattern detected)",
  "",
];

if (review.length) {
  for (const r of review) {
    lines.push(`- \`${r.methods.join(",")} ${r.routePath}\``);
  }
} else {
  lines.push("_None — all non-public routes match an auth pattern._");
}

lines.push("", "## Full inventory", "", "| Method | Route | Status | Auth |", "| --- | --- | --- | --- |");
for (const r of rows) {
  lines.push(`| ${r.methods.join("/")} | \`${r.routePath}\` | ${r.status} | ${r.authHits.join(", ") || "—"} |`);
}

const outPath = path.join(process.cwd(), "docs", "API_ROUTE_AUDIT.md");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join("\n"));
console.log(`Wrote ${outPath}`);
console.log(`Review needed: ${review.length}`);
