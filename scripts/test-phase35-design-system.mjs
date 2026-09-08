/**
 * Phase 35 — design system foundation completeness checks.
 * Run: npm run test:phase35-design-system
 */

import fs from "fs";

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

console.log("=== PHASE 35 DESIGN SYSTEM FOUNDATION TESTS ===\n");

// Tokens
assert(fs.existsSync("lib/design/cn.ts"), "cn utility");
assert(fs.existsSync("lib/design/field-styles.ts"), "shared field styles");
assert(read("lib/design/erp-tokens.css").includes("--erp-surface-elevated"), "surface-elevated token");
assert(read("lib/design/erp-tokens.css").includes("--erp-focus-ring"), "focus ring token");
assert(read("lib/design/erp-tokens.css").includes("--erp-space-4"), "spacing tokens");
assert(read("app/globals.css").includes("erp-tokens.css"), "tokens imported");

const primitives = [
  "button.tsx",
  "input.tsx",
  "select.tsx",
  "textarea.tsx",
  "checkbox.tsx",
  "radio.tsx",
  "form-field.tsx",
  "form-section.tsx",
  "card.tsx",
  "badge.tsx",
  "alert.tsx",
  "modal.tsx",
  "confirm-dialog.tsx",
  "drawer.tsx",
  "tabs.tsx",
  "toast.tsx",
  "page-header.tsx",
  "section-header.tsx",
  "workspace-header.tsx",
  "stat-card.tsx",
  "empty-state.tsx",
  "skeleton.tsx",
  "action-bar.tsx",
  "search-input.tsx",
  "filter-bar.tsx",
  "pagination.tsx",
  "data-table.tsx",
  "index.ts",
];

for (const f of primitives) {
  assert(fs.existsSync(`components/ui/${f}`), `ui/${f}`);
}

// Page structure
const pageShell = read("components/layout/page-shell.tsx");
assert(pageShell.includes("header"), "PageShell header slot");
assert(pageShell.includes("filter"), "PageShell filter slot");
assert(pageShell.includes("pagination"), "PageShell pagination slot");

// DataTable capabilities
const dt = read("components/ui/data-table.tsx");
assert(dt.includes("sortable"), "DataTable sorting");
assert(dt.includes("onSelectionChange"), "DataTable selection");
assert(dt.includes("TableSkeleton"), "DataTable loading skeleton");
assert(dt.includes("EmptyState"), "DataTable empty state");
assert(dt.includes("ErrorState"), "DataTable error state");

// Drawer pattern
const drawer = read("components/ui/drawer.tsx");
assert(drawer.includes("footer"), "Drawer footer");
assert(drawer.includes("DrawerFooterActions"), "Drawer footer actions");

// Workspace
assert(fs.existsSync("lib/workspace/resolve-workspace.ts"), "workspace resolver");
assert(read("lib/workspace/resolve-workspace.ts").includes("isOwnerAccount"), "role-based workspace");
assert(!read("lib/workspace/resolve-workspace.ts").includes("fn2@gmail"), "no hardcoded email");

// i18n
assert(read("lib/i18n/messages/design-id.ts").includes("pagination:"), "design i18n ID");
assert(read("lib/i18n/messages/design-en.ts").includes("pagination:"), "design i18n EN");

// Safety — unchanged sensitive flows
assert(!read("components/account/AccountVerificationModal.tsx").includes("PayslipPin"), "34F verification preserved");
assert(!read("lib/hr/payroll-slip-pdf.ts").includes("components/ui"), "payslip PDF not touched");

// No mass migration
assert(read("app/(dashboard)/hr/page.tsx").includes("pb.collection"), "HR page not mass-migrated");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
