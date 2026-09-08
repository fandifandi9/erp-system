# PHASE 35 — DESIGN SYSTEM FOUNDATION REPORT

**Scope:** LOCAL ONLY — foundation completion, no mass module migration.

**Status:** FOUNDATION COMPLETE — STOP for review.

---

## 1. Architecture

```
SERBA ERP
├── lib/design/
│   ├── cn.ts                 # class merge
│   ├── erp-tokens.css        # CSS variables SSOT
│   └── field-styles.ts       # shared input/select/textarea styles
│
├── components/ui/            # 28 primitives + index.ts barrel
│   ├── Form: Button, Input, Select, Textarea, Checkbox, Radio, FormField, FormSection
│   ├── Layout: PageHeader, SectionHeader, WorkspaceHeader, Section, ActionBar
│   ├── Data: DataTable, FilterBar, Pagination, SearchInput
│   ├── Feedback: Toast, Alert, Modal, Dialog, ConfirmDialog, Drawer
│   ├── State: EmptyState, LoadingState, ErrorState, PermissionDeniedState, Skeleton
│   └── Display: Card, Badge, StatCard, Tabs, QuickAction
│
├── components/layout/
│   ├── page-shell.tsx        # Standard page slots
│   └── workspace-layout.tsx  # Role workspace structure
│
└── lib/workspace/
    ├── resolve-workspace.ts  # role + canAccess()
    └── workspaces/staff.ts   # Staff config (pilot only)
```

**Principle:** ONE DESIGN SYSTEM → ONE APP SHELL → ROLE WORKSPACE → MODULE CONTENT

---

## 2. Components Delivered

| # | Component | File | Status |
|---|-----------|------|--------|
| 1 | Button | `button.tsx` | ✅ |
| 2 | Input | `input.tsx` | ✅ |
| 3 | Select | `select.tsx` | ✅ |
| 4 | Textarea | `textarea.tsx` | ✅ |
| 5 | Checkbox | `checkbox.tsx` | ✅ |
| 6 | Radio | `radio.tsx` | ✅ |
| 7 | FormField | `form-field.tsx` | ✅ |
| 8 | FormSection | `form-section.tsx` | ✅ |
| 9 | Card | `card.tsx` | ✅ |
| 10 | Badge / StatusBadge | `badge.tsx` | ✅ |
| 11 | Modal | `modal.tsx` | ✅ |
| 12 | ConfirmDialog | `confirm-dialog.tsx` | ✅ |
| 13 | Drawer | `drawer.tsx` | ✅ |
| 14 | Tabs | `tabs.tsx` | ✅ |
| 15 | Toast | `toast.tsx` | ✅ |
| 16 | Alert | `alert.tsx` | ✅ |
| 17 | PageHeader | `page-header.tsx` | ✅ |
| 18 | SectionHeader | `section-header.tsx` | ✅ |
| 19 | DataTable | `data-table.tsx` | ✅ |
| 20 | FilterBar | `filter-bar.tsx` | ✅ |
| 21 | Pagination | `pagination.tsx` | ✅ |
| 22 | SearchInput | `search-input.tsx` | ✅ |
| 23 | EmptyState | `empty-state.tsx` | ✅ |
| 24 | LoadingState | `empty-state.tsx` | ✅ |
| 25 | ErrorState | `empty-state.tsx` | ✅ |
| 26 | PermissionDeniedState | `empty-state.tsx` | ✅ |
| 27 | Skeleton | `skeleton.tsx` | ✅ |
| 28 | ActionBar | `action-bar.tsx` | ✅ |

**Barrel export:** `components/ui/index.ts`

---

## 3. Design Tokens (`lib/design/erp-tokens.css`)

| Category | Tokens |
|----------|--------|
| Brand | `--erp-primary`, `--erp-primary-hover`, `--erp-primary-soft` |
| Semantic | `--erp-success/warning/danger/info` + `-soft` variants |
| Surfaces | `--erp-bg`, `--erp-surface`, `--erp-surface-muted`, `--erp-surface-elevated` |
| Borders | `--erp-border`, `--erp-border-strong` |
| Text | `--erp-text`, `--erp-text-secondary`, `--erp-text-muted`, `--erp-text-subtle` |
| Focus | `--erp-focus-ring` |
| Spacing | `--erp-space-1` … `--erp-space-8` |
| Radius | `--erp-radius-sm` … `--erp-radius-xl` |
| Shadow | `--erp-shadow-sm/md/lg` |
| Typography | `--erp-font-sans`, `--erp-text-xs` … `--erp-text-2xl` |

Field controls use `lib/design/field-styles.ts` — no per-component color hardcoding.

---

## 4. Standard Page Structure

```tsx
<PageShell
  header={<PageHeader title="..." description="..." action={...} />}
  filter={<FilterBar search={...} onSearchChange={...}>...</FilterBar>}
  summary={<StatCard ... />}
>
  <DataTable columns={...} rows={...} />
</PageShell>
<Pagination page={...} pageSize={...} total={...} />
```

---

## 5. DataTable Capabilities

- Column definitions with `accessor` render functions
- Optional sorting (`sortable` + `onSortChange`)
- Optional row selection (`selectedIds` + `onSelectionChange`)
- Loading → `TableSkeleton`
- Empty → `EmptyState`
- Error → `ErrorState`
- Row actions column
- Sticky header
- Horizontal scroll wrapper (responsive)
- **No business logic** — presentation only

---

## 6. Workspace Pattern

- `WorkspaceLayout` — header → KPI → alerts → quick actions → content
- `resolveWorkspaceId(user)` — `isOwnerAccount`, `isHrAccount`, `canAccess()`
- Staff pilot at `/dashboard-staff` (unchanged from prior increment)
- Owner/HR/Accounting configs = stubs only

---

## 7. Responsive Strategy

- Desktop-first layouts with `sm:` / `lg:` breakpoints
- DataTable: `overflow-x-auto` wrapper — no font shrinking
- Drawer: full-width on mobile, fixed max-width on desktop
- FilterBar: stacks vertically on mobile, row on desktop
- Tabs: horizontal scroll on narrow screens

---

## 8. i18n Strategy

- Existing `LocaleProvider` + `lib/i18n` preserved
- New keys in `design-id.ts` / `design-en.ts`:
  - `design.empty`, `design.error`, `design.permission`
  - `design.pagination`, `design.filter`, `design.form`, `design.table`
  - `workspace.staff.*` (pilot)
- Reusable components accept label props; defaults use i18n at page level

---

## 9. Testing Results

| Suite | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ PASS |
| `npm run test:phase35-design-system` | ✅ 52/52 |
| `npm run test:phase34g` | ✅ 26/26 |
| `npm run test:phase34f-refinement` | ✅ 36/36 |
| `npm run test:phase34f-hr-policy-privacy` | ✅ 53/53 |

---

## 10. Files Changed (This Increment)

**Created:**
- `lib/design/field-styles.ts`
- `components/ui/select.tsx`, `textarea.tsx`, `checkbox.tsx`, `radio.tsx`
- `components/ui/search-input.tsx`, `alert.tsx`, `section-header.tsx`, `action-bar.tsx`
- `components/ui/skeleton.tsx`, `drawer.tsx`, `tabs.tsx`, `pagination.tsx`
- `components/ui/filter-bar.tsx`, `data-table.tsx`, `confirm-dialog.tsx`, `form-section.tsx`
- `components/ui/index.ts`

**Updated:**
- `lib/design/erp-tokens.css` — expanded tokens
- `components/ui/input.tsx` — field-styles
- `components/ui/empty-state.tsx` — icon, PermissionDeniedState
- `components/layout/page-shell.tsx` — slot-based structure
- `lib/i18n/messages/design-id.ts`, `design-en.ts` — design.* keys
- `scripts/test-phase35-design-system.mjs` — 52 checks
- `scripts/test-phase34f-hr-policy-privacy.mjs` — profile path check

---

## 11. Files NOT Changed

- Payslip PDF (`lib/hr/payroll-slip-pdf.ts`)
- Payroll calculation / snapshot logic
- RBAC (`lib/rbac.ts`)
- Account Verification (`AccountVerificationModal`, server gate)
- Bank workflow (Phase 34G)
- `/hr`, `/profile`, `/dashboard-owner` pages (no mass migration)
- Sidebar RBAC logic (presentation only from prior increment)

---

## 12. Known Limitations

1. **DataTable** — client-side sorting UI only; server-side sort/pagination wiring is page responsibility.
2. **DatePicker** — not built; use native `input[type=date]` via `Input` until dedicated component.
3. **Breadcrumb** — not built yet.
4. **EntityBadge / RoleBadge / PermissionAction** — deferred to next increment (types planned).
5. **ProfileFeedbackToast** — legacy compat layer still in use on profile pages.
6. **Owner/HR/Accounting workspaces** — config stubs only.

---

## 13. Recommended Migration Order (After Review)

1. `/profile` — PageShell + FormSection + global Toast
2. `/hr` — WorkspaceLayout + DataTable on employees list
3. `/dashboard-owner` — WorkspaceLayout + StatCard KPIs
4. Module hubs: `/keuangan`, `/gudang`, `/pos`, `/penjualan`, `/pembelian`
5. Pilot DataTable on HR employees + bank approval panel
6. Deprecate `ProfileFeedbackToast` → `useToast()`
7. Payslip PDF redesign — **separate phase** (not Phase 35)

---

## 14. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | tsc PASS | ✅ |
| 2 | Phase 34 tests PASS | ✅ |
| 3 | Phase 35 tests PASS | ✅ |
| 4 | No duplicate global UI | ✅ |
| 5 | Tokens SSOT | ✅ |
| 6–11 | DataTable, FilterBar, Drawer, Tabs, Pagination, States | ✅ |
| 12–13 | Form + Workspace layout | ✅ |
| 14 | i18n ID/EN | ✅ |
| 15–19 | RBAC, payroll, payslip, verification, bank unchanged | ✅ |
| 20 | No mass migration | ✅ |

---

**STOP.** Awaiting review before migrating `/profile`, `/hr`, or other modules.

*LOCAL ONLY — do not deploy.*
