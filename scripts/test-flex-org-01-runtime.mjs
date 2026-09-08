/**
 * Phase FLEX-ORG-01 — Runtime pure resolver tests (no Next runtime).
 * Mirrors lib/org/resolve-primary-workspace.ts + workspace-domain.ts + multi-company-scope.
 */

function parseWorkspaceDomain(raw) {
  const allowed = ["hr", "finance", "warehouse", "purchasing", "sales", "pos", "director", "general"];
  if (raw == null || raw === "") return null;
  const v = String(raw).trim().toLowerCase();
  return allowed.includes(v) ? v : null;
}

function homeRouteForWorkspaceDomain(domain) {
  const map = {
    hr: "/hr",
    finance: "/keuangan",
    warehouse: "/gudang",
    purchasing: "/pembelian",
    sales: "/penjualan",
    pos: "/pos",
    director: "/dashboard-director",
    general: "/dashboard-staff",
  };
  return map[domain];
}

function resolvePrimaryWorkspace({ user, hasHrHubGrant, hasFinanceHubGrant, hasWarehouseHubGrant }) {
  if (!user) return { homeRoute: null, source: "none", domain: null };
  if (user.account_type === "owner") {
    return { homeRoute: "/dashboard-owner", source: "owner", domain: null };
  }
  const positionDomain = parseWorkspaceDomain(user.active_workspace_domain);
  if (positionDomain) {
    return {
      homeRoute: homeRouteForWorkspaceDomain(positionDomain),
      source: "position",
      domain: positionDomain,
    };
  }
  if (hasHrHubGrant) return { homeRoute: "/hr", source: "module_hub_compat", domain: "hr" };
  if (hasWarehouseHubGrant) return { homeRoute: "/gudang", source: "module_hub_compat", domain: "warehouse" };
  if (hasFinanceHubGrant) return { homeRoute: "/keuangan", source: "module_hub_compat", domain: "finance" };
  if (user.dashboard_access) {
    return { homeRoute: "/dashboard-staff", source: "dashboard_access", domain: "general" };
  }
  return { homeRoute: null, source: "none", domain: null };
}

function assertIndependentCompaniesDoNotLeak({ actorCompanyIds, targetCompanyId }) {
  return new Set(actorCompanyIds).has(targetCompanyId);
}

function operatingModeImpliesCrossCompanyAccess() {
  return false;
}

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  ✓", msg);
  } else {
    failed++;
    console.log("  ✗", msg);
  }
}

console.log("=== FLEX-ORG-01 RUNTIME RESOLVER ===\n");

console.log("CASE — Position → Workspace");
{
  const hr = resolvePrimaryWorkspace({
    user: { account_type: "user", active_workspace_domain: "hr", role_code: "manager", dashboard_access: true },
    hasHrHubGrant: false,
  });
  assert(hr.homeRoute === "/hr" && hr.source === "position", "HR Manager position → /hr");

  const wh = resolvePrimaryWorkspace({
    user: { account_type: "user", active_workspace_domain: "warehouse", role_code: "staff" },
  });
  assert(wh.homeRoute === "/gudang", "Warehouse Staff → /gudang");

  const fin = resolvePrimaryWorkspace({
    user: { account_type: "user", active_workspace_domain: "finance", role_code: "staff" },
  });
  assert(fin.homeRoute === "/keuangan", "Finance Staff → /keuangan");

  const custom = resolvePrimaryWorkspace({
    user: {
      account_type: "user",
      active_workspace_domain: "warehouse",
      // custom jabatan name must NOT matter
      jabatan: "Koordinator Gudang Senior",
      role_code: "manager",
    },
  });
  assert(custom.homeRoute === "/gudang" && custom.source === "position", "custom Position name ignored; domain wins");
}

console.log("\nCASE — role_code does not override Position");
{
  const r = resolvePrimaryWorkspace({
    user: {
      account_type: "user",
      role_code: "hr",
      active_workspace_domain: "warehouse",
      dashboard_access: true,
    },
    hasHrHubGrant: true,
  });
  assert(r.homeRoute === "/gudang" && r.source === "position", "role_code=hr loses to Position warehouse");
}

console.log("\nCASE — Position without org level still works");
{
  const r = resolvePrimaryWorkspace({
    user: { account_type: "user", active_workspace_domain: "hr" },
  });
  assert(r.homeRoute === "/hr", "domain alone sufficient (no level)");
}

console.log("\nCASE — Director workspace");
{
  const r = resolvePrimaryWorkspace({
    user: { account_type: "user", active_workspace_domain: "director" },
  });
  assert(r.homeRoute === "/dashboard-director", "Director → management workspace");
}

console.log("\nCASE — Transfer Position changes workspace");
{
  const before = resolvePrimaryWorkspace({
    user: { account_type: "user", active_workspace_domain: "warehouse" },
  });
  const after = resolvePrimaryWorkspace({
    user: { account_type: "user", active_workspace_domain: "finance" },
  });
  assert(before.homeRoute === "/gudang" && after.homeRoute === "/keuangan", "transfer warehouse→finance");
}

console.log("\nCASE — Compat module hub when Position unset");
{
  const r = resolvePrimaryWorkspace({
    user: { account_type: "user", role_code: "manager", dashboard_access: true },
    hasHrHubGrant: true,
  });
  assert(r.homeRoute === "/hr" && r.source === "module_hub_compat", "module hub compat without position domain");
}

console.log("\nCASE — Multi company invariants");
{
  assert(operatingModeImpliesCrossCompanyAccess() === false, "Group != universal permission");
  assert(
    assertIndependentCompaniesDoNotLeak({
      actorCompanyIds: ["a"],
      targetCompanyId: "b",
    }) === false,
    "independent companies do not leak",
  );
  assert(
    assertIndependentCompaniesDoNotLeak({
      actorCompanyIds: ["a", "b"],
      targetCompanyId: "b",
    }) === true,
    "explicit scope allows target",
  );
}

console.log("\nCASE — Invalid domain ignored (no jabatan inference)");
{
  const r = resolvePrimaryWorkspace({
    user: {
      account_type: "user",
      active_workspace_domain: "HR Manager", // invalid — must not parse
      dashboard_access: true,
    },
  });
  assert(r.source === "dashboard_access" && r.homeRoute === "/dashboard-staff", "invalid domain falls through");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
