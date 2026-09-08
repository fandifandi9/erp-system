# Phase 34C — Master Organization / Legal Entity Foundation

**Date:** 2026-08-31  
**Mode:** READ-ONLY AUDIT (Step 1)  
**Scope:** Legal Entity master data, employee–entity relationship, HR UI, attendance compatibility, accounting consumption, migration safety  
**Out of scope:** Code changes, migrations, staging, production, APK

---

## FINAL GATE

# ✅ READY FOR DESIGN (Step 2)

Audit selesai. **Tidak ada konflik arsitektur besar** yang menghalangi Phase 34C design.

**Temuan utama:** Master Legal Entity **sudah ada** sebagai `biz_company_profile`. Phase 34C bukan membuat entity master baru, melainkan **formalisasi governance**, perbaikan employee–entity assignment, dan penutupan gap UX/authorization. **Jangan** membuat koleksi entity duplikat.

**STOP di sini** — implementasi (Step 3) menunggu `PHASE_34C_ENTITY_MASTER_DESIGN.md`.

Production = **UNTOUCHED** · Staging = **UNTOUCHED** · APK = **NOT BUILT**

---

## Executive Summary

SERBA System sudah memiliki fondasi multi-entitas yang cukup matang:

| Konsep | Koleksi / mekanisme saat ini | Status |
|--------|------------------------------|--------|
| **Legal Entity** | `biz_company_profile` | ✅ Master sudah ada |
| **User ↔ Entity membership** | `biz_user_companies` | ✅ Ada, tanpa `is_primary` |
| **Work context pointer** | `users.active_company`, `users.default_company` | ✅ Ada (server-only mutation) |
| **Work location** | `offices` + `profiles.office_id` | ✅ Terpisah dari entity |
| **Organizational structure** | `profiles`: dept, division, position, manager | ✅ Opsional, terpisah |
| **Attendance legal stamp** | `attendance_logs.company_id` (Phase 34B, local) | ✅ Server-resolved |
| **Accounting / finance** | FK `company` → `biz_company_profile` | ✅ Consume master yang sama |

**Gap utama Phase 34C:**

1. UI karyawan menampilkan **"Perusahaan (PT)" read-only** — bukan selector dari master; onboarding **infer** entity dari HR actor tanpa validasi.
2. **Tidak ada `entity_type`** (PT/CV/Non-PT) di schema production.
3. **Tidak ada `is_primary`** di `biz_user_companies` — primary entity di-disambiguate via `users.default_company` / `active_company`.
4. **Entity master CRUD** via client PocketBase langsung (`company-client.ts`) — **bukan server-authoritative API**; HR **tidak punya path RBAC** ke `/pengaturan/perusahaan`.
5. **Dual scope semantics:** tenant layer fallback ke `active_company`; HR layer (`company-scope.ts`) **fail closed** tanpa fallback — intentional tapi membingungkan.
6. **Payroll** belum stamp `company` per slip — bergantung profil user, belum entity-aware penuh.

---

## 1. Apa yang Sekarang Berfungsi sebagai Entity?

### 1.1 Kandidat master: `biz_company_profile`

**Ini adalah satu-satunya legal-entity master** di codebase. Tidak ada `accounting_companies`, `legal_entities`, atau duplikat lain.

**Schema production** (`docs/PHASE_21_PRODUCTION_SCHEMA_BEFORE.json`):

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `company_name` | text | yes | Display name |
| `legal_name` | text | no | Legal registered name |
| `code` | text | no | Short code (e.g. LOCAL, SDI) |
| `is_active` | bool | no | Soft disable |
| `npwp` | text | no | Tax ID (existing, used on documents) |
| `address`, `city`, `phone`, `email`, `website` | text | no | Contact / legal address |
| `show_npwp_on_documents` | bool | no | Document display policy |
| `npwp_display_mode` | select | no | `footer` \| `header_secondary` |

**Local bootstrap** (`scripts/bootstrap-local-pb.mjs`) hanya 4 field dasar; script incremental (`fix-pb-company-schema.mjs`, `fix-pb-tenant-schema.mjs`) menambah field lain → **schema drift** antar environment.

**TypeScript type:** `CompanyProfile` in `lib/bisnis/types.ts` (lines 963–980).

**UI master CRUD:** `app/(dashboard)/pengaturan/perusahaan/page.tsx`
- List/create/edit/deactivate entities
- Entity provisioning (warehouse + cash account stack via `entity-provision.ts`)
- Audit via `writeAuditLog` on save (tenant audit, bukan HR employee audit)

**Client data layer:** `lib/bisnis/company-client.ts` — direct PocketBase CRUD, no `/api/*` route.

### 1.2 Bukan entity master (jangan dicampur)

| Koleksi / field | Fungsi sebenarnya |
|-----------------|-------------------|
| `offices` | Work location / geofence GPS |
| `profiles.department`, `division`, `position` | Organizational labels (optional) |
| `profiles.manager` | Reporting hierarchy (optional) |
| `users.active_company` / `default_company` | Work-context pointer, **bukan** master |
| `biz_stores`, `inv_warehouses` | Operational units **under** an entity |

---

## 2. Apakah `biz_company_profile` Dapat Dijadikan Master Entity?

### ✅ YA — rekomendasi audit

**Alasan:**

1. Sudah dipakai sebagai FK oleh 15+ koleksi transaksional (sales, purchase, finance, inventory, HR work schedules).
2. Sudah punya UI Owner di Pengaturan → Perusahaan.
3. Sudah punya soft-disable (`is_active`).
4. Accounting/finance **sudah consume** via `lib/bisnis/entity-resolve.ts` — tidak perlu `accounting_companies`.
5. Phase 34B attendance stamping sudah relation ke `biz_company_profile`.

**Repurpose aman = extend, bukan replace:**

| Perlu ditambah (design Step 2) | Catatan |
|--------------------------------|---------|
| `entity_type` (select/enum) | PT, CV, Firma, Yayasan, Non-PT, Other — **belum ada** |
| `display_name` alias | Bisa map ke `company_name` existing; `legal_name` sudah ada |
| `timezone` | Opsional; belum ada — evaluate need vs work schedule TZ |
| Rename UI label | "Perusahaan" → "Entitas Administratif" (cosmetic) |

**Jangan:**

- Membuat koleksi `legal_entities` atau `administrative_entities` baru
- Rename koleksi `biz_company_profile` (breaking change massif)
- Cascade-delete entity yang sudah direferensikan

---

## 3. Apakah Ada Duplicate Company/Entity?

### ✅ Tidak ada duplikat master

**Junction / membership (bukan duplicate master):**

```
biz_user_companies
  user     → users
  company  → biz_company_profile
  is_active
```

**Denormalized FK `company` / `company_id` on transactional collections** — pattern normal, bukan duplicate master:

| Collection | Field | Points to |
|------------|-------|-----------|
| `biz_sales_orders`, `biz_invoices`, `biz_purchase_orders`, `biz_expenses`, `biz_cash_accounts`, … | `company` | `biz_company_profile` |
| `biz_cash_transfers` | `from_company`, `to_company`, `initiated_company` | `biz_company_profile` |
| `hr_work_schedules` | `company` (required) | `biz_company_profile` |
| `attendance_logs` | `company_id` | `biz_company_profile` (Phase 34B local only) |
| `biz_activity_events`, `sys_audit_log` | `company` | `biz_company_profile` |

**Naming inconsistency:** HR attendance uses `company_id`; everywhere else uses `company`. Design should standardize naming in new code only (no production rename in 34C).

**Deferred / absent:**

- `profiles.company` — explicitly deferred (`lib/hr/company-scope.ts` Wave 1 comment)
- `profiles.legal_entity_id` — tidak ada; membership via `biz_user_companies`

---

## 4. Bagaimana Employee Terhubung ke Entity?

### 4.1 Current link chain

```
users (identity)
  ↓
biz_user_companies (membership M2M)
  company → biz_company_profile
  is_active
  ↓
users.default_company / active_company (disambiguation pointer)
  ↓
profiles (HR data — NO company field)
  office_id → offices (work location)
  manager → users (hierarchy)
  department, division, position (optional org labels)
```

### 4.2 Onboarding (`lib/hr/employee-onboarding-server.ts`)

On employee create (after user + profile):

```typescript
if (_ctx.companyIds.length > 0) {
  const companyForMembership = _ctx.companyIds[0]!;  // FIRST actor company only
  await adminPb.collection("biz_user_companies").create({
    user: userId, company: companyForMembership, is_active: true,
  });  // best-effort — failure swallowed
}
```

**Issues:**

| Issue | Impact |
|-------|--------|
| No client entity selection | HR cannot pick entity on create form |
| Uses actor's **first** scoped company | Wrong entity if HR spans multiple PT |
| Best-effort, no validation | Employee can exist with **zero** membership → attendance 403 |
| Does not set `default_company` / `active_company` | Multi-membership later fails until manual fix |
| No audit event for entity assignment | Gap for compliance |

### 4.3 Employee edit UI (`app/(dashboard)/hr/employees/[id]/page.tsx`)

**Phase 34B interim change:** read-only disabled field `"Perusahaan (PT)"` fed by client fetch of `biz_user_companies`.

- **Not editable** on employee form
- Empty state references `npm run pb:company-access`
- **No server API** for HR to change entity assignment from employee page

**Alternative path today:** Owner/HR via `app/(dashboard)/pengaturan/akses-entitas/page.tsx` + `PUT /api/tenant/users/company-access` — but HR **blocked from nav/RBAC path** to this page (see §8).

### 4.4 Primary entity disambiguation

**No `is_primary` on `biz_user_companies`.**

| Scenario | Resolution |
|----------|------------|
| 0 memberships | Attendance 403; HR scope empty |
| 1 membership | Use that company |
| Multiple memberships | `users.default_company` then `active_company` if in set; else 403 |

Source: `lib/hr/employment-scope.ts` → `resolveAttendanceCompanyId()`.

**`replaceUserCompanyAccess`** syncs `active_company`/`default_company` to first ID in list when current pointer invalid.

---

## 5. Bagaimana Attendance Terhubung?

### Phase 34B behavior (local, verified)

```
Staff Check-in/out
  → POST /api/hr/attendance/check-in|check-out
  → assertAttendanceCapability (attendance.check_in/out)
  → resolveAttendanceCompanyId(adminPb, userId)  // NEVER trusts client company_id
  → attendance_logs.company_id = resolved entity
  → attendance-engine.ts (single calc)
```

**Client cannot send company_id** for selection — enforced server-side.

**Office/GPS:** separate validation via `profiles.office_id` → `offices` geofence.

**Phase 34C must NOT break:**

- No PT selector on attendance UI ✅ already correct
- Server-resolved `company_id` ✅
- Manager scope = hierarchy ∩ company ✅
- HR scope = company membership ✅

**Compatibility risk:** If 34C adds entity selector to employee form but forgets to sync membership + default_company pointers, attendance may 403 for multi-entity employees.

---

## 6. Apa Dampaknya ke HR?

### 6.1 Authorization layers

| Layer | File | Non-owner scope |
|-------|------|-----------------|
| HR API auth | `lib/hr/company-scope.ts` | `biz_user_companies` only — **no fallback** |
| Tenant / work context | `lib/tenant/company-access.ts` | membership + fallback to `active_company`/`default_company` |
| Employee data scope | `lib/hr/employee-scope.ts` | COMPANY = overlap membership between actor and target |

### 6.2 HR capabilities (Phase 31)

From `lib/capabilities/employee.ts` — **no dedicated entity master capability**:

| Capability | Scope | Entity CRUD? |
|------------|-------|--------------|
| `employee.create`, `employee.update`, … | COMPANY | No |
| `employee.assign_manager` | COMPANY | No |

Entity access management uses **role gate** (`canManageCompanyAccess` → owner OR hr), not capability registry.

### 6.3 HR navigation gap

HR sidebar (`PENGATURAN_NAV_ITEMS_HR` in `lib/wms/navigation.ts`):

- ✅ Peran & Izin
- ✅ Notifikasi
- ❌ Entitas Administratif (`/pengaturan/perusahaan`)
- ❌ Akses Entitas (`/pengaturan/akses-entitas`)

RBAC (`lib/rbac.ts`): HR allowed `/pengaturan`, `/pengaturan/role`, `/pengaturan/notifikasi` — **not** `/pengaturan/perusahaan`.

**Design implication (Owner request):**

- HR **must NOT** create/rename entities ✅ already blocked by RBAC
- HR **should** select entity on employee onboarding — **not implemented**
- HR **should** view entities in scope — partial (read-only on employee detail only)

### 6.4 Work location vs entity on employee form

| Field | Location on form | Editable |
|-------|------------------|----------|
| Entitas (PT) | Top of HR section (read-only) | ❌ |
| Kantor (`office_id`) | Top of HR section (dropdown) | ✅ required |
| Atasan langsung | HR section | ✅ optional |
| Dept / Divisi / Posisi | HR section | ✅ optional |

Work location master: `/hr/offices` (HR sidebar: "Pengaturan GPS") — correctly separate from entity master.

---

## 7. Apa Dampaknya ke Payroll?

### Current state

`lib/payroll.ts`:
- Reads `profiles`, `attendance_logs`, leave, overtime
- `payroll_items` links to `profile` — **no `company` FK on payroll collections observed**
- Slip document (`mobile/lib/payroll-slip-document.ts`) hardcodes "SERBA" branding — **not entity-aware**

### Impact of Phase 34C

| Area | Current | After 34C (expected) |
|------|---------|----------------------|
| Primary entity for payroll | Implicit (none) | Should resolve from membership primary |
| Multi-entity employee | Undefined | Needs primary entity rule |
| Slip header legal name | Static | Should use `biz_company_profile.legal_name` |
| Historical integrity | N/A | Entity deactivate must not break past payroll_items |

**Recommendation for design:** Payroll entity stamping is **out of scope for 34C implementation** unless minimal read of primary membership added. Document as Phase 34C+ or payroll wave.

---

## 8. Apa Dampaknya ke Accounting?

### ✅ Already consumes `biz_company_profile`

**Resolution layer:** `lib/bisnis/entity-resolve.ts`
- `resolveCompanyForSalesOrder`, `resolveCompanyForExpense`, etc.
- Filter scoping: `mergeCompanyFilter`, `mergeSalesCompanyFilter`

**Finance UI:** all `keuangan/*` pages scope via `WorkContextProvider` → `workCtx.companyId`

**Inter-company:** `biz_cash_transfers` with `from_company` / `to_company` / `initiated_company`

**Phase 34C accounting impact:** **Minimal** — formalizing entity master labels and `entity_type` improves document identity (`lib/tenant/document-identity-server.ts`) but does not require new accounting collections.

**Principle confirmed:** Accounting **consumes** master entity; does not own it.

---

## 9. Migration Minimum yang Diperlukan

### Local only (production untouched)

| Migration | Purpose | Idempotent? | Destructive? |
|-----------|---------|-------------|--------------|
| Add `entity_type` to `biz_company_profile` | Flexible entity classification | Yes (ensure field) | No |
| Optional: `is_primary` on `biz_user_companies` | Explicit primary membership | Yes | No |
| Optional: backfill `entity_type = 'PT'` for existing rows | Default for legacy | Yes | No |
| Backfill `biz_user_companies` for employees missing membership | Already in `migrate-local-hr-phase34b.mjs` / `pb:company-access` | Yes | No |
| **Do NOT** rename `biz_company_profile` | Breaking | — | — |
| **Do NOT** add `profiles.company` yet | Deferred; use membership | — | — |

**Production / staging:** **ZERO schema changes in Phase 34C** per Owner instruction.

---

## 10. Risiko Backward Compatibility

| Risk | Severity | Mitigation |
|------|----------|------------|
| Renaming collection or breaking FK | 🔴 High | Extend `biz_company_profile` in place |
| HR entity selector assigns wrong company | 🟡 Medium | Server re-validates scope; audit `employee.entity_changed` |
| Multi-membership without primary | 🟡 Medium | Add `is_primary` OR enforce default_company sync on assign |
| Tenant vs HR scope divergence | 🟡 Medium | Document; align employee assign with `replaceUserCompanyAccess` |
| Client-side entity CRUD bypasses auth | 🟡 Medium | Phase 34C should add server API for entity master |
| `company` vs `company_id` naming | 🟢 Low | New code only; no rename |
| Inactive entity on historical records | 🟢 Low | Soft-disable only; FK preserved |
| Payroll not entity-stamped | 🟢 Low | Defer; document limitation |
| Schema drift local vs production | 🟡 Medium | Single bootstrap/migration script chain |

---

## 11. Security Audit

| Rule | Current | Gap |
|------|---------|-----|
| HR cannot create entity | ✅ RBAC blocks `/pengaturan/perusahaan` | Entity CRUD still possible if HR calls PB API directly |
| HR cannot rename entity | ✅ Same | Need server API with capability check |
| HR cannot assign entity outside scope | ⚠️ N/A — no assign UI | Must enforce on new employee entity API |
| Client cannot inject company_id on attendance | ✅ Phase 34B | Keep |
| Inactive entity blocked for new assign | ⚠️ Partial | `fetchCompanyProfiles(activeOnly=true)` in UI; server must enforce |
| No cascade delete | ✅ `deactivateCompanyProfile` soft only | Keep |
| Audit events | ⚠️ Partial | `writeAuditLog` on entity save; no `entity.*` event codes standardized |

**Sensitive data:** NPWP on entity master is appropriate (company-level). Do not log NIK/NPWP employee in entity audit.

---

## 12. UI Audit — "Perusahaan (PT)" Field

| Page | Current behavior | Phase 34C target |
|------|------------------|------------------|
| `/hr/employees/new` | **No entity field** | Select from master (scoped) |
| `/hr/employees/[id]` | Read-only "Perusahaan (PT)" | "Entitas Administratif" select (scoped, server-validated) |
| `/dashboard-staff/attendance` | No entity selector ✅ | Keep |
| `/pengaturan/perusahaan` | Full CRUD (Owner) | Rename label → Entitas Administratif; add entity_type |
| `/pengaturan/akses-entitas` | Membership matrix (Owner path; HR role allowed in API but not nav) | Clarify HR access policy in design |

---

## 13. Master Data Navigation Audit

From `docs/NAVIGATION_SETTINGS_AUDIT.md`:

| Menu | Route | Role | Status |
|------|-------|------|--------|
| Perusahaan | `/pengaturan/perusahaan` | Owner only (HR blocked) | READY |
| Akses Entitas | `/pengaturan/akses-entitas` | Owner (+ API allows HR) | READY, nav leak |
| Kantor / GPS | `/hr/offices` | HR + Owner | READY (work location) |
| Dept/Divisi/Jabatan | HR employee form options | HR | READY (org labels, not hierarchy tree) |

**Phase 34C navigation recommendation (design only):**

```
PENGATURAN SISTEM (Owner)
├── Entitas Administratif     ← rename from Perusahaan
├── Akses Entitas             ← membership (Owner; HR view-only TBD)
└── … existing …

SDM / HR
├── Kantor (Lokasi Kerja)     ← already /hr/offices
└── Karyawan → Entitas select on form (not master CRUD)
```

Do **not** build full org tree menu in 34C.

---

## 14. Small Company vs Large Company — Current Support

### Small company (Owner + Staff, no HR, no manager)

| Requirement | Supported? |
|-------------|------------|
| Single entity | ✅ `biz_company_profile` + membership |
| No manager | ✅ `profiles.manager` optional |
| No department | ✅ optional fields |
| Login + attendance | ✅ if membership + office set |
| No HR role | ✅ Owner manages entity + employees |

### Large company (multi-entity, group HR)

| Requirement | Supported? |
|-------------|------------|
| Multiple entities | ✅ multiple `biz_company_profile` rows |
| Scoped HR | ✅ via `biz_user_companies` intersection |
| Group HR cross-company | ⚠️ Union of HR's memberships — no explicit grant table |
| Manager hierarchy ∩ company | ✅ Phase 34B |
| Primary entity for payroll/docs | ❌ Not formalized |

---

## 15. Existing Audit / Event Infrastructure

| System | Collection | Entity events |
|--------|------------|---------------|
| Tenant audit | `sys_audit_log` via `writeAuditLog` | Used on company profile save |
| HR employee audit | `lib/hr/employee-audit.ts` | `MANAGER_CHANGED`, `CREATED`, etc. — **no `ENTITY_CHANGED`** |
| Activity events | `biz_activity_events` | Generic `entity_type` + `entity_id` |

**Phase 34C should add:** `entity.created`, `entity.updated`, `entity.activated`, `entity.deactivated`, `employee.entity_changed` — in design doc.

---

## 16. Regression Baseline (Pre-34C)

Phase 34B local verification (from implementation report):

| Suite | Result |
|-------|--------|
| Phase 34B attendance | 18/18 PASS |
| Phase 33A | 42/42 PASS |
| Phase 33B | 31/31 PASS |
| Phase 32 | 35/35 PASS |
| Phase 31 | 32/32 PASS |
| TypeScript | PASS |

34C implementation must re-run full regression + new entity tests.

---

## 17. Answers to Mandatory Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Apa yang sekarang berfungsi sebagai entity? | **`biz_company_profile`** — sole legal-entity master |
| 2 | Apakah `biz_company_profile` dapat dijadikan master entity? | **Ya** — extend with `entity_type`; do not duplicate |
| 3 | Apakah ada duplicate company/entity? | **Tidak** — hanya denormalized FKs on transactions |
| 4 | Bagaimana employee terhubung ke entity? | **`biz_user_companies`** M2M + optional `users.default_company`/`active_company` |
| 5 | Bagaimana attendance terhubung? | **`attendance_logs.company_id`** server-resolved via `employment-scope.ts` |
| 6 | Apa dampaknya ke HR? | Perlu entity **select** on employee form; HR tidak CRUD master; scope via membership |
| 7 | Apa dampaknya ke payroll? | Belum entity-stamped; perlu primary entity rule (defer implementation) |
| 8 | Apa dampaknya ke accounting? | **Sudah consume** master; minimal 34C impact |
| 9 | Apa migration minimum? | Local: add `entity_type`; optional `is_primary`; backfill membership |
| 10 | Apa risiko backward compatibility? | Low if extend-in-place; medium on scope/primary semantics |

---

## 18. Architecture Diagram (Current)

```
                    ┌─────────────────────────┐
                    │   biz_company_profile   │  ← LEGAL ENTITY MASTER
                    │  (company_name, code,   │
                    │   legal_name, npwp,     │
                    │   is_active, …)         │
                    └───────────┬─────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
 biz_user_companies      biz_* transactions    hr_work_schedules
 (user ↔ company)        (company FK)          (company FK)
          │
          ▼
       users ──────────► profiles ──────────► offices
       (default/active     (dept, div,         (work location)
        company ptr)        position, manager)

Attendance: resolveAttendanceCompanyId() → attendance_logs.company_id
Accounting: entity-resolve.ts → company FK on finance docs
Payroll: profiles (no entity FK yet)
```

---

## 19. Recommended Design Direction (Preview for Step 2)

> **Not implementation** — for `PHASE_34C_ENTITY_MASTER_DESIGN.md`

1. **Repurpose `biz_company_profile`** as "Entitas Administratif" — add `entity_type` enum.
2. **Employee entity assignment** via server API updating `biz_user_companies` + sync `default_company`.
3. **Optional `is_primary`** on membership OR document primary = first + `default_company` rule.
4. **HR employee form:** scoped entity select; rename label; remove read-only free-text pattern.
5. **Entity master CRUD:** wrap in server API + capability (`entity.manage` or reuse owner-only).
6. **Do not touch** attendance client contract.
7. **Navigation:** rename Pengaturan → Perusahaan label only; no full org menu tree.

---

## 20. STOP Condition

✅ **Audit complete.**  
✅ **No major architecture conflict.**  
⛔ **Do not implement until design doc approved.**

**Next step:** Owner review → `docs/PHASE_34C_ENTITY_MASTER_DESIGN.md` (Step 2)

---

*Related: `docs/PHASE_34B_ATTENDANCE_IMPLEMENTATION_REPORT.md`, `docs/PHASE_34_ATTENDANCE_ORGANIZATION_AUDIT.md`, `docs/NAVIGATION_SETTINGS_AUDIT.md`, `lib/hr/SERVER_AUTHORIZATION_CONTRACT.md`*
