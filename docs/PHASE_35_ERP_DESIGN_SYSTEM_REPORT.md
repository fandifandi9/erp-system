# PHASE 35 — ERP GLOBAL DESIGN SYSTEM (Foundation + Staff Pilot)

**Scope:** LOCAL ONLY — no staging, production, or APK deploy.

**Status:** FOUNDATION + STAFF PILOT COMPLETE — awaiting review before mass migration.

---

## 1. Architecture Tree

```
SERBA ERP
└── lib/design/
    ├── cn.ts                    # class merge utility
    └── erp-tokens.css           # semantic CSS tokens (--erp-*)

└── components/ui/               # Global primitives (SSOT)
    ├── button.tsx
    ├── input.tsx
    ├── label.tsx
    ├── form-field.tsx
    ├── card.tsx
    ├── badge.tsx                # Badge + StatusBadge
    ├── section.tsx
    ├── page-header.tsx
    ├── workspace-header.tsx
    ├── stat-card.tsx            # StatCard, QuickAction, WorkspaceShortcut
    ├── empty-state.tsx          # Empty, Loading, Error states
    ├── modal.tsx                # Modal + Dialog
    └── toast.tsx                # ToastProvider + useToast

└── components/layout/
    ├── page-shell.tsx           # Standard page wrapper
    └── workspace-layout.tsx     # Role workspace structure

└── components/workspace/
    └── StaffWorkspaceView.tsx   # Staff pilot implementation

└── lib/workspace/
    ├── types.ts
    ├── resolve-workspace.ts     # role/capability resolver (no username)
    └── workspaces/
        ├── staff.ts             # ✅ configured
        └── owner.ts             # stub (next phase)

└── app/(dashboard)/layout.tsx   # AppShell + ToastProvider (unchanged logic)
    ├── Sidebar.tsx              # RBAC nav (visual token polish)
    └── Navbar.tsx               # erp-surface topbar

ONE DESIGN SYSTEM → MANY ROLE WORKSPACES → MODULE CONTENT
```

---

## 2. Files Created

| Path | Purpose |
|------|---------|
| `lib/design/cn.ts` | Class name helper |
| `lib/design/erp-tokens.css` | Semantic design tokens |
| `components/ui/*` (14 files) | Global UI primitives |
| `components/layout/page-shell.tsx` | Page wrapper |
| `components/layout/workspace-layout.tsx` | Workspace structure |
| `lib/workspace/types.ts` | WorkspaceConfig types |
| `lib/workspace/resolve-workspace.ts` | Role-based resolver |
| `lib/workspace/workspaces/staff.ts` | Staff workspace config |
| `lib/workspace/workspaces/owner.ts` | Owner stub |
| `components/workspace/StaffWorkspaceView.tsx` | Staff pilot UI |
| `lib/i18n/messages/design-id.ts` | ID translations |
| `lib/i18n/messages/design-en.ts` | EN translations |
| `scripts/test-phase35-design-system.mjs` | Static tests |

---

## 3. Files Refactored

| Path | Change |
|------|--------|
| `app/globals.css` | Import ERP tokens; body uses `--erp-bg` |
| `app/(dashboard)/layout.tsx` | `ToastProvider` wrapper |
| `app/(dashboard)/dashboard-staff/page.tsx` | Uses `StaffWorkspaceView` |
| `components/wms/ui.tsx` | `WmsCard`/`WmsBadge` → global Card/Badge |
| `components/Navbar.tsx` | `erp-surface` / `erp-border` tokens |
| `lib/i18n/messages/id.ts`, `en.ts` | Merge design messages |
| `package.json` | `test:phase35-design-system` script |
| `scripts/test-phase34f-hr-policy-privacy.mjs` | Staff workspace profile link check |

---

## 4. Files Removed

None (backward compatibility preserved).

---

## 5. Compatibility Strategy

```
New global primitive (components/ui/*)
        ↓
Compatibility wrapper (e.g. WmsCard → Card)
        ↓
Existing module pages (unchanged behavior)
        ↓
Incremental migration per module
        ↓
Deprecate wrapper when zero imports
```

- `ProfileFeedbackToast` / `ShareFeedbackToast` — **kept** (not removed)
- `AccountVerificationModal` — **untouched** (Phase 34F)
- Payslip PDF / payroll logic — **untouched**
- RBAC / navigation logic — **untouched**

---

## 6. Design Token Specification

| Token | Value | Usage |
|-------|-------|-------|
| `--erp-primary` | `#ffc107` | Brand accent (maps to indigo-600 buttons) |
| `--erp-primary-soft` | `#fff8e1` | Soft brand backgrounds |
| `--erp-success` / `-soft` | emerald | Approved, active, paid |
| `--erp-warning` / `-soft` | amber | Pending, attention |
| `--erp-danger` / `-soft` | red | Rejected, error |
| `--erp-info` / `-soft` | sky | Informational |
| `--erp-bg` | `#f8fafc` | App background |
| `--erp-surface` | `#ffffff` | Cards, navbar |
| `--erp-border` | `#e2e8f0` | Borders |
| `--erp-text` / `-muted` / `-subtle` | slate scale | Typography hierarchy |

Existing Tailwind `indigo-*` remap in `globals.css` **preserved** for hundreds of legacy pages.

---

## 7. Workspace Architecture

```typescript
WorkspaceConfig {
  id, titleKey, subtitleKey,
  sections: [{ id, titleKey, actionIds[] }],
  quickActions: [{ id, titleKey, href, icon, accessPath }]
}
```

**Resolver:** `resolveWorkspaceId(user)` uses `isOwnerAccount`, `isHrAccount`, `canAccess()` — never email/username.

**Staff workspace** filters actions via `canAccess(user, accessPath)` — staff without `/hr/reports` won't see Reports card.

**Entity branding:** Staff workspace fetches `/api/profile/self/entity-identity` for logo + display name (Phase 34G SSOT).

---

## 8. Migration Order (Remaining)

| Step | Target | Status |
|------|--------|--------|
| 1–7 | Foundation + workspace arch | ✅ Done |
| 8 | `/dashboard-staff` | ✅ Pilot done |
| 9 | `/profile` | ⏳ Next (after review) |
| 10 | `/dashboard-staff/payroll` | ⏳ UI primitives only, no payslip redesign |
| 11 | `/hr` | ⏳ Pending |
| 12 | `/dashboard-owner` | ⏳ Pending |
| 13+ | keuangan, gudang, pos, penjualan, pembelian | ⏳ Pending |

**STOPPED** after staff pilot per spec — no mass migration.

---

## 9. Risk Assessment

| Risk | Mitigation |
|------|------------|
| Visual regression on 200+ pages | Primitives additive; legacy Tailwind unchanged |
| Duplicate button systems | WMS re-exports global Card/Badge |
| Breaking 34F verification | Modal not touched |
| Breaking payroll | Payslip pages not modified |
| Staff sees admin menus | RBAC unchanged; workspace filters by `canAccess` |

---

## 10. Testing Results

| Suite | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ PASS |
| `npm run test:phase35-design-system` | ✅ 26/26 |
| `npm run test:phase34f-hr-policy-privacy` | ✅ 53/53 (after test update) |
| `npm run test:phase34g` | ✅ 26/26 |

---

## 11. Manual UAT Checklist (Staff Pilot)

- [ ] Login as staff (`fn2@gmail.com`)
- [ ] Open `/dashboard-staff` — "Meja Kerja Staf" header
- [ ] Entity logo/name appears if configured (Identitas Entitas)
- [ ] Sections: Personal, Kehadiran, Penggajian, Informasi Perusahaan
- [ ] No Master Data / HR admin / Accounting menus in shortcuts
- [ ] Profile shortcut → `/profile`
- [ ] Slip gaji shortcut → `/dashboard-staff/payroll` (unchanged payslip flow)
- [ ] Language switch ID ↔ EN updates workspace labels
- [ ] Sidebar + Navbar visually consistent (erp-surface topbar)
- [ ] ToastProvider active (no errors in console)

---

## 12. Known Limitations

1. **Primitives subset** — DataTable, FilterBar, Pagination, Drawer, Tabs not yet built (next increment).
2. **Owner/HR/Accounting workspaces** — resolver exists; configs are stubs except Staff.
3. **Sidebar** — logic unchanged; full visual compact redesign deferred.
4. **POS layout** — separate shell; not migrated.
5. **ProfileFeedbackToast** — still used on profile pages; global `useToast` available for new code.
6. **Payslip** — explicitly not redesigned in Phase 35.

---

## 13. Next Steps (After Owner Review)

1. Approve foundation primitives API
2. Migrate `/profile` to PageShell + global Card/Tabs styling
3. Add DataTable + FilterBar primitives
4. Migrate `/hr` workspace with live KPIs
5. Migrate `/dashboard-owner`
6. Module hub pages (keuangan, gudang, etc.)

---

*LOCAL ONLY — do not deploy without explicit approval.*
