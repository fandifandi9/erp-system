# PHASE 35I-B0 — OWNER MODULE ASSIGNMENT UI REPORT

**Scope:** LOCAL ONLY — no staging, production, APK, or deployment.

**Status:** Implementation complete — awaiting Owner live browser/API UAT. **STOP** — do not proceed to 35I-B full or 35J.

---

## 1. Audit Before Coding

### Existing route / settings location

| Area | Path | Access |
|------|------|--------|
| Pengaturan hub | `/pengaturan` | Role-based nav |
| Akses Entitas | `/pengaturan/akses-entitas` | Owner OR HR |
| Akses Modul (new) | `/pengaturan/akses-modul` | **Owner only** |
| Effective access preview (read-only) | `GET /api/access/self/effective` | Authenticated user |

### Existing reusable components / patterns

- `components/ui/drawer.tsx` — Drawer + DrawerFooterActions (Phase 35 design system)
- `components/ui/button.tsx` — primary/secondary/danger variants
- `app/(dashboard)/pengaturan/akses-entitas/page.tsx` — table + inline save pattern
- `app/(dashboard)/pengaturan/page.tsx` — `showOwnerPengaturanExtras` hub links
- `lib/access/module-registry.ts` — module catalog (HR, Finance, Warehouse, Purchasing, Sales, POS)
- `lib/access/resolve-effective-access.ts` — effective access resolver (35I)

### Collections / fields (Phase 35I migration — no new migration)

| Collection | Purpose |
|------------|---------|
| `sys_user_module_assignments` | `user`, `module_id`, `access_mode`, `entity_scope_mode`, `desk_enabled`, `is_active`, `granted_by`, `notes` |
| `sys_user_module_permissions` | `assignment`, `permission_key` (CUSTOM mode) |
| `sys_user_module_entities` | `assignment`, `company` (SELECTED scope) |
| `biz_user_companies` | User entity membership (INTERSECTION base) |

### Existing API used

| Endpoint | Use |
|----------|-----|
| `GET /api/access/self/effective` | Read-only self preview (not used for admin write) |

### New API required

Write endpoints did not exist — created Owner-protected admin CRUD:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/access/admin/module-assignments` | List + users + catalog |
| POST | `/api/access/admin/module-assignments` | Create |
| PATCH | `/api/access/admin/module-assignments/[id]` | Update / toggle active |
| DELETE | `/api/access/admin/module-assignments/[id]` | Delete |
| POST | `/api/access/admin/module-assignments/preview` | Effective access preview |

---

## 2. Architecture Used

```
Owner UI (Pengaturan → Akses Modul)
        ↓
API (canManageModuleAssignments → isOwnerAccount)
        ↓
module-assignment-admin-server.ts (validate + CRUD)
        ↓
PocketBase collections (sys_user_module_*)
        ↓
resolve-effective-access.ts (enforcement on login/session — 35I-A)
```

No changes to capability resolver logic beyond admin CRUD layer. Enforcement remains additive (legacy + module).

---

## 3. UI Location

```
Pengaturan
├── Konteks kerja (Owner)
├── Akses Entitas (Owner extras — membership user → perusahaan)
├── Akses Modul (Owner extras — module assignment)  ← NEW
└── … existing pengaturan links
```

**Semantic distinction preserved:**
- **Akses Entitas** = `biz_user_companies` membership
- **Akses Modul** = module assignment + capability + module entity scope

---

## 4. Screens / Components Created

| File | Description |
|------|-------------|
| `app/(dashboard)/pengaturan/akses-modul/page.tsx` | Page wrapper |
| `components/settings/ModuleAssignmentAdminPanel.tsx` | Main table + drawer form |

**Table columns:** Pengguna, Modul, Akses, Scope Entity, Meja Kerja, Status, Aksi

**Drawer form fields:** Pengguna (searchable), Modul, FULL/CUSTOM, Entity ALL/SELECTED, Meja Kerja toggle, Status, Effective Access preview

---

## 5. API Created / Modified

### Created

- `app/api/access/admin/module-assignments/route.ts`
- `app/api/access/admin/module-assignments/[id]/route.ts`
- `app/api/access/admin/module-assignments/preview/route.ts`

### Server libs (from prior session, used by API)

- `lib/access/module-assignment-admin-server.ts`
- `lib/access/can-manage-module-assignments.ts`
- `lib/access/capability-ui-catalog.ts`
- `lib/access/owner-only-capabilities.ts`

### Modified

- `app/(dashboard)/pengaturan/page.tsx` — hub link "Akses Modul"
- `package.json` — `test:phase35i-b0-owner-module-assignment-ui`

---

## 6. Authorization

| Actor | UI `/pengaturan/akses-modul` | API write |
|-------|------------------------------|-----------|
| Owner | ALLOWED | ALLOWED |
| Super Admin / HR | DENIED (client gate) | DENIED (403) |
| Staff / Manager | DENIED | DENIED (403) |

**Gate:** `canManageModuleAssignments()` → `isOwnerAccount(user)` only.

Hiding menu is not security — all write endpoints validate Owner server-side.

---

## 7. Entity Scope Handling

- **ALL:** No rows in `sys_user_module_entities`; effective scope = user membership (`biz_user_companies`)
- **SELECTED:** Rows in `sys_user_module_entities`; effective = **INTERSECTION** (membership ∩ selected)
- UI only shows entities from user membership when SELECTED
- Server rejects entity IDs not in membership

---

## 8. FULL vs CUSTOM

| Mode | Behavior |
|------|----------|
| FULL | All module capabilities from registry; excludes Owner-only (`employee.activate`, `employee.deactivate`, `employee.manage_hr_accounts`) |
| CUSTOM | Only checked capabilities from UI catalog; Owner-only keys rejected server-side |

UI uses human-friendly labels from `capability-ui-catalog.ts` (grouped: Karyawan, Kehadiran, Jadwal Kerja, etc.)

---

## 9. desk_enabled

- Toggle "Tambahkan ke Meja Kerja" in form
- Persisted as `desk_enabled` on assignment record
- **Does NOT grant capabilities** — only affects Meja Kerja visibility (35I-A desk boundary unchanged)
- UI includes disclaimer text

---

## 10. Security Tests

| # | Scenario | Expected | Automated | Live |
|---|----------|----------|-----------|------|
| 1 | Staff opens Akses Modul page | DENIED | Static (isOwnerAccount gate) | **NOT RUN** |
| 2 | HR opens Akses Modul page | DENIED | Static | **NOT RUN** |
| 3 | Owner opens page | ALLOWED | Static | **NOT RUN** |
| 4 | Staff POST assignment API | 403 | Static (canManageModuleAssignments) | **NOT RUN** |
| 5 | HR POST assignment API | 403 | Static | **NOT RUN** |
| 6 | Owner creates Staff+HR+FULL+PT A | Created | Static CRUD wiring | **NOT RUN** |
| 7 | Staff re-login → HR route | Accessible | N/A (35I-A resolver) | **NOT RUN** |
| 8 | Staff PT B with PT A scope | Denied | 35I resolver tests | **NOT RUN** |
| 9 | desk_enabled OFF | Auth intact, desk hidden | Static + 35I-A | **NOT RUN** |

---

## 11. Regression Tests

| Suite | Result |
|-------|--------|
| `test:phase35i-b0-owner-module-assignment-ui` | **37/37 PASS** |
| `test:phase35i-a-access-enforcement` | **42/42 PASS** |
| `test:phase35i-access-architecture` | **38/38 PASS** |
| `test:phase35h-staff-role-module-entry` | **42/42 PASS** |
| `test:phase35g-final-dashboard` | **28/28 PASS** |
| `test:phase35f-meja-kerja` | **8/8 PASS** |
| `test:phase35e-role-aware-workspace` | **21/21 PASS** |
| `test:phase35d-staff-workspace-shell` | **20/20 PASS** |
| `test:phase35c-staff-profile-ux` | **25/25 PASS** |
| `test:phase35b-profile` | **35/35 PASS** |
| `test:phase35-design-system` | **52/52 PASS** |
| **Total automated** | **348 PASS** |

---

## 12. TypeScript

```
npx tsc --noEmit → PASS
```

---

## 13. Files Created

```
app/(dashboard)/pengaturan/akses-modul/page.tsx
app/api/access/admin/module-assignments/route.ts
app/api/access/admin/module-assignments/[id]/route.ts
app/api/access/admin/module-assignments/preview/route.ts
components/settings/ModuleAssignmentAdminPanel.tsx
lib/access/can-manage-module-assignments.ts
lib/access/capability-ui-catalog.ts
lib/access/module-assignment-admin-server.ts
lib/access/owner-only-capabilities.ts
scripts/test-phase35i-b0-owner-module-assignment-ui.mjs
docs/PHASE_35I_B0_OWNER_MODULE_ASSIGNMENT_UI_REPORT.md
```

---

## 14. Files Modified

```
app/(dashboard)/pengaturan/page.tsx
package.json
```

---

## 15. Migration

**None.** Uses collections from Phase 35I migration (`npm run migrate:local-hr-phase35i`).

---

## 16. Known Limitations

1. **Live browser UAT not performed** — automated/static tests only
2. **Assignment change requires logout/login** for session to pick up new module access
3. **Finance/Warehouse API authorization** not integrated (deferred)
4. **Rating, Reporting, Payroll Bank** still use legacy `isHr` (35I-A gaps unchanged)
5. **Non-HR modules** (Finance, Warehouse, etc.) CUSTOM picker shows web-path groups only — no granular capability registry yet
6. **Super Admin** is not a separate account type — only `account_type=owner` can manage assignments

---

## 17. Manual UAT Procedure

### Prerequisites

1. Local dev server running (`npm run dev`)
2. PocketBase running with Phase 35I collections migrated
3. Owner account logged in
4. Staff user exists (e.g. `fn2@gmail.com`) with entity membership via Akses Entitas

### Scenario A — Staff without HR

1. Login as Staff (no HR assignment)
2. Navigate to `/hr`
3. **Expected:** Access denied

### Scenario B — Owner assigns HR FULL

1. Login as Owner
2. Go to **Pengaturan → Akses Modul**
3. Click **Tambah Akses Modul**
4. Select Staff user, Modul **HR**, Mode **FULL**, Scope **SELECTED** → PT A, Meja Kerja ON, Status Aktif
5. Save
6. Staff logout + login
7. Navigate to `/hr`
8. **Expected:** HR accessible

### Scenario C — Entity scope

1. With assignment PT A only
2. Staff tries data/context for PT B
3. **Expected:** Denied (403 or empty scope)

### Scenario D — CUSTOM mode

1. Create HR CUSTOM with subset of capabilities (e.g. `employee.view` only)
2. Staff re-login
3. **Expected:** Assigned caps work; unassigned denied

### Scenario E — desk_enabled

1. Edit assignment, turn Meja Kerja OFF
2. Staff re-login
3. **Expected:** HR auth still works; HR item missing from Meja Kerja

### Security spot checks

- Staff/HR visiting `/pengaturan/akses-modul` → denied message
- Staff/HR `POST /api/access/admin/module-assignments` → 403

---

## 18. GO / NO-GO Recommendation

| Gate | Status |
|------|--------|
| Automated regression (348 tests) | **PASS** |
| TypeScript static | **PASS** |
| Live browser UAT | **NOT RUN — NO-GO for production** |
| Live API UAT (Owner create → Staff verify) | **NOT RUN — NO-GO for production** |

**Recommendation:** **GO for Owner local UAT review.** Implementation is complete for Phase 35I-B0 scope. Proceed to next phase only after Owner completes manual UAT scenarios A–E.

---

*Phase 35I-B0 complete. STOP — do not proceed to 35I-B full or 35J.*
