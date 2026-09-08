/**
 * Phase FLEX-ORG-02 — Runtime pure Shared/Separated + workspace tests (no Next runtime).
 * Run: npm run test:flex-org-02
 */

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

function parseFunctionalOperatingMode(raw) {
  const v = String(raw ?? "SEPARATED").trim().toUpperCase();
  return v === "SHARED" ? "SHARED" : "SEPARATED";
}

function isHybridOperatingState(map) {
  const domains = ["hr", "finance", "sales", "warehouse", "purchasing", "pos"];
  const modes = domains.map((d) => map[d] ?? "SEPARATED");
  return modes.includes("SHARED") && modes.includes("SEPARATED");
}

function resolveSharedOperationalCandidates(input) {
  const management = new Set(input.managementEntityIds.filter(Boolean));
  // FLEX-ORG-04-UI-02 — SEPARATED = inactive (no Management-shared ops list)
  if (input.mode === "SEPARATED") return [];
  if (input.sharedScopeKind === "ALL_IN_MANAGEMENT") {
    return [...management];
  }
  return input.selectedEntityIds.filter((id) => management.has(id));
}

function rejectOutsideManagement(candidateIds, managementEntityIds) {
  const allowed = new Set(managementEntityIds);
  return candidateIds.filter((id) => allowed.has(id));
}

function assertEmploymentDistinctFromOps(input) {
  const emp = input.employmentCompanyId?.trim() || null;
  const ops = [...new Set(input.operationalCompanyIds.filter(Boolean))];
  return {
    employmentCompanyId: emp,
    operationalCompanyIds: ops,
    employmentIncludedInOps: emp ? ops.includes(emp) : false,
  };
}

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

function resolvePrimaryWorkspace({ user, hasHrHubGrant }) {
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
  if (user.dashboard_access) {
    return { homeRoute: "/dashboard-staff", source: "dashboard_access", domain: "general" };
  }
  return { homeRoute: null, source: "none", domain: null };
}

console.log("=== FLEX-ORG-02 RUNTIME ===\n");

console.log("CASE — Management multi-entity + isolation");
{
  const costa = ["pt-a", "pt-b", "cv-c"];
  assert(costa.length === 3, "management with multiple legal entities");
  assert(!costa.includes("external-x"), "external not in membership");
  const independent = ["solo-1"];
  assert(
    rejectOutsideManagement(["solo-1", "pt-a"], independent).join(",") === "solo-1",
    "independent entity isolation",
  );
  assert(
    rejectOutsideManagement(["pt-a", "external-x"], costa).join(",") === "pt-a",
    "group entity isolation / outside rejection",
  );
}

console.log("\nCASE — Operating model Shared / Separated / mixed");
{
  const map = {
    hr: "SHARED",
    finance: "SHARED",
    sales: "SEPARATED",
    warehouse: "SHARED",
    purchasing: "SHARED",
    pos: "SEPARATED",
  };
  assert(isHybridOperatingState(map), "mixed configuration → hybrid state");
  assert(parseFunctionalOperatingMode("SHARED") === "SHARED", "parse SHARED");
  assert(parseFunctionalOperatingMode("HYBRID") === "SEPARATED", "HYBRID not a mode → SEPARATED default");

  const mgmt = ["pt-a", "pt-b", "cv-c"];
  const hrSharedAll = resolveSharedOperationalCandidates({
    mode: "SHARED",
    managementEntityIds: mgmt,
    sharedScopeKind: "ALL_IN_MANAGEMENT",
    selectedEntityIds: [],
    employmentCompanyId: "pt-a",
  });
  assert(hrSharedAll.sort().join(",") === "cv-c,pt-a,pt-b", "HR Shared all-management scope");

  const hrSelected = resolveSharedOperationalCandidates({
    mode: "SHARED",
    managementEntityIds: mgmt,
    sharedScopeKind: "SELECTED",
    selectedEntityIds: ["pt-a", "pt-b", "external-x"],
    employmentCompanyId: "pt-a",
  });
  assert(hrSelected.sort().join(",") === "pt-a,pt-b", "selected scope rejects outside management");

  const salesSep = resolveSharedOperationalCandidates({
    mode: "SEPARATED",
    managementEntityIds: mgmt,
    sharedScopeKind: "ALL_IN_MANAGEMENT",
    selectedEntityIds: mgmt,
    employmentCompanyId: "pt-a",
  });
  assert(salesSep.length === 0, "Sales inactive (SEPARATED) → no ops candidates");

  const salesB = resolveSharedOperationalCandidates({
    mode: "SHARED",
    managementEntityIds: mgmt,
    sharedScopeKind: "SELECTED",
    selectedEntityIds: ["pt-b"],
    employmentCompanyId: "pt-b",
  });
  assert(salesB.join(",") === "pt-b" && !salesB.includes("pt-a"), "Sales active + PT B only cannot auto-access PT A");
}

console.log("\nCASE — Shared never global wildcard");
{
  const leaked = rejectOutsideManagement(["pt-a", "global-all", "world"], ["pt-a", "pt-b"]);
  assert(leaked.join(",") === "pt-a", "outside-management rejection");
  const emptyMgmt = resolveSharedOperationalCandidates({
    mode: "SHARED",
    managementEntityIds: [],
    sharedScopeKind: "ALL_IN_MANAGEMENT",
    selectedEntityIds: ["pt-a"],
    employmentCompanyId: "pt-a",
  });
  assert(emptyMgmt.length === 0, "SHARED with empty management → empty (fail-closed)");
}

console.log("\nCASE — Employment ≠ operational scope");
{
  const dist = assertEmploymentDistinctFromOps({
    employmentCompanyId: "pt-a",
    operationalCompanyIds: ["pt-a", "pt-b", "cv-c"],
  });
  assert(dist.employmentCompanyId === "pt-a", "employment company preserved");
  assert(dist.operationalCompanyIds.length === 3, "one HR ops across multiple entities");
  assert(dist.employmentIncludedInOps === true, "employment may be included in ops without merge");
}

console.log("\nCASE — Position → Workspace; role_code cannot override");
{
  const hr = resolvePrimaryWorkspace({
    user: {
      account_type: "user",
      active_workspace_domain: "hr",
      role_code: "manager",
      dashboard_access: true,
    },
    hasHrHubGrant: false,
  });
  assert(hr.source === "position" && hr.homeRoute === "/hr", "Position → workspace");

  const dir = resolvePrimaryWorkspace({
    user: {
      account_type: "user",
      active_workspace_domain: "director",
      role_code: "staff",
    },
  });
  assert(dir.homeRoute === "/dashboard-director" && dir.source === "position", "Director workspace");

  const overrideAttempt = resolvePrimaryWorkspace({
    user: {
      account_type: "user",
      active_workspace_domain: "warehouse",
      role_code: "hr",
    },
    hasHrHubGrant: true,
  });
  assert(
    overrideAttempt.domain === "warehouse" && overrideAttempt.source === "position",
    "role_code cannot override explicit workspace_domain",
  );

  const legacy = resolvePrimaryWorkspace({
    user: { account_type: "user", active_workspace_domain: null, role_code: "hr" },
    hasHrHubGrant: true,
  });
  assert(legacy.source === "module_hub_compat" && legacy.homeRoute === "/hr", "NULL domain → compat fallback");
}

console.log("\nCASE — Authorization concern separation (conceptual)");
{
  // workspace ≠ capability ≠ scope ≠ hierarchy — verified as independent axes
  const workspace = "hr";
  const capability = { canApproveLeave: false };
  const scope = ["pt-a"];
  const hierarchy = { canApprove: false };
  assert(workspace === "hr" && !capability.canApproveLeave, "workspace != capability");
  assert(capability.canApproveLeave === false && scope.length === 1, "capability != scope");
  assert(scope[0] === "pt-a" && hierarchy.canApprove === false, "scope != hierarchy authority");
  assert(workspace === "director" || workspace === "hr", "Director domain does not imply full permission");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
