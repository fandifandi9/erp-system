# Phase 34C — System Master Data & Legal Entity Architecture

**Date:** 2026-08-31  
**Mode:** DESIGN ONLY (Step 2)  
**Prerequisite:** `docs/PHASE_34C_ENTITY_MASTER_AUDIT.md`  
**Status:** Awaiting Owner approval before Step 3 implementation

---

## FINAL GATE

# ✅ DESIGN COMPLETE — READY FOR OWNER REVIEW

**Do NOT implement** until Owner approves this document.

Production = **UNTOUCHED** · Staging = **UNTOUCHED** · APK = **NOT BUILT** · Local schema = **UNTOUCHED**

---

## 1. Executive Summary

Phase 34C formalizes a **System Master Data Layer** — shared foundation consumed by HR, Attendance, Accounting, Inventory, Sales, Purchase, and POS. It is **not** an HR module feature and **not** an attendance company picker.

**Core decision:** Reuse `biz_company_profile` as the **single Legal Entity master**. Extend governance, employee membership, and navigation — **do not** create duplicate company collections.

**Phase 34C delivers:**

| Deliverable | Scope |
|-------------|-------|
| Legal Entity master governance | Extend `biz_company_profile` + server API + capabilities |
| Employee ↔ Entity assignment | Scoped select on onboarding/edit; server-authoritative membership |
| Primary entity rule | Single source of truth (design below) |
| Master Data navigation | IA layer under Pengaturan — no destructive data moves |
| Audit events | Entity + membership change events |
| Compatibility | Attendance 34B unchanged; accounting/inventory unchanged |

**Phase 34C does NOT deliver:** Full org tree, payroll entity stamping, accounting redesign, office→entity FK (optional defer), recruitment, POS changes.

---

## 2. Existing Architecture Audit

### 2.1 Master data inventory (REUSE)

| Master concept | Existing collection / mechanism | Owner module today | Phase 34C action |
|----------------|--------------------------------|--------------------|------------------|
| **Legal Entity** | `biz_company_profile` | Pengaturan → Perusahaan (Owner) | **EXTEND** — `entity_type`, server API, rename label |
| **User ↔ Entity membership** | `biz_user_companies` | Pengaturan → Akses Entitas | **EXTEND** — `is_primary`, server assign API |
| **Work context pointer** | `users.active_company`, `users.default_company` | Work context API | **SYNC** from primary — not independent truth |
| **Work location** | `offices` | HR → Pengaturan GPS (`/hr/offices`) | **REUSE** — nav consolidation only |
| **Position** | `hr_employee_options` (`category=position`) + `profiles.position` text | HR employee form | **REUSE** — nav link to existing manage UI |
| **Department** | `hr_employee_options` (`category=department`) + `profiles.department` | HR employee form | **REUSE** |
| **Division** | `hr_employee_options` (`category=division`) + `profiles.division` | HR employee form | **REUSE** |
| **Reporting hierarchy** | `profiles.manager` → `users` | HR employee form | **REUSE** — no change |
| **Operational store** | `biz_stores` (`company` FK) | Bisnis settings | **CONSUMER** — not legal entity |
| **Warehouse** | `inv_warehouses` (`company` FK) | Gudang | **CONSUMER** |
| **POS register** | `biz_pos_registers` (if exists) | Pengaturan POS | **CONSUMER** |

### 2.2 Collections that MUST NOT be created

```
legal_entities
accounting_companies
hr_companies
attendance_companies
inventory_companies
master_departments        (duplicate of hr_employee_options)
master_positions          (duplicate)
organization_units        (defer — not needed for 34C)
```

### 2.3 Transactional FK pattern (consumers)

All modules stamp or filter by `biz_company_profile.id`:

| Domain | Collections | Field name |
|--------|-------------|------------|
| Sales | `biz_sales_orders`, `biz_invoices`, `biz_returs` | `company` |
| Purchase | `biz_purchase_orders`, `biz_purchase_bills` | `company` |
| Finance | `biz_expenses`, `biz_cash_accounts`, `biz_cash_transfers` | `company` / `from_company` / `to_company` |
| Inventory | `inv_warehouses`, stock movements | `company` |
| HR schedule | `hr_work_schedules` | `company` (required) |
| Attendance | `attendance_logs` | `company_id` (local 34B) |
| Audit | `sys_audit_log`, `biz_activity_events` | `company` |

**Naming note:** New HR code may use `company_id` alias in types; **do not rename** production PB fields in 34C.

### 2.4 Current gaps (from Step 1 audit)

1. Entity CRUD via client PocketBase (`lib/bisnis/company-client.ts`) — not server-authoritative.
2. Employee onboarding: best-effort first actor company — no HR select, no validation.
3. No `entity_type` on legal entity master.
4. No `is_primary` on membership — three implicit sources (`biz_user_companies`, `default_company`, `active_company`).
5. HR blocked from Pengaturan entity nav (RBAC) but API allows HR on membership matrix.
6. Payroll collections have **no** `company` FK.
7. `offices` has **no** `company` FK — locations are globally managed today.

---

## 3. Master Data Philosophy

### 3.1 Principles

1. **One system layer** — Master Data lives above modules, not inside them.
2. **Modules consume, never own** — HR assigns membership; Attendance stamps; Accounting journals.
3. **Separate dimensions** — Legal Entity ≠ Organization ≠ Position ≠ Work Location.
4. **Optional complexity** — Small companies omit HR, manager, department without breaking flows.
5. **Server authoritative** — All privilege, membership, and entity assignment via API + capabilities.
6. **Historical immutability** — Finalized records keep stamped entity/reference; master changes do not rewrite history.

### 3.2 Layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  SYSTEM MASTER DATA LAYER                    │
│  Legal Entity │ Work Location │ Dept/Div/Position options  │
│  (biz_company_profile) (offices) (hr_employee_options)       │
└───────────────────────────┬─────────────────────────────────┘
                            │ read / FK / membership
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
       HR              ACCOUNTING          INVENTORY
   (membership)      (company FK)       (warehouse FK)
        │                   │                   │
        ▼                   ▼                   ▼
   ATTENDANCE           PAYROLL            SALES/PURCHASE/POS
 (company_id stamp)   (future stamp)      (company FK)
```

---

## 4. Target System Architecture

### 4.1 New server modules (Step 3 — design only)

| Module | Responsibility |
|--------|----------------|
| `lib/master-data/legal-entity.ts` | CRUD helpers, validation, inactive rules |
| `lib/master-data/membership.ts` | Assign/remove membership, primary rules |
| `lib/capabilities/master-data.ts` | Capability registry |
| `lib/master-data/entity-audit.ts` | Standardized audit event codes |
| `app/api/master-data/legal-entities/*` | Server CRUD (Owner/admin) |
| `app/api/hr/employees/[id]/membership/*` | HR-scoped membership assign |

**Deprecate gradually:** Direct `company-client.ts` writes from UI → route through server API.

### 4.2 Data flow — employee lifecycle

```
HR actor (authenticated)
  → resolve actor company scope (biz_user_companies)
  → list assignable Legal Entities (active, in scope)
  → HR selects entity (+ optional additional memberships)
  → POST server API (never trust client scope)
  → create/update biz_user_companies (+ is_primary)
  → sync users.default_company from primary
  → emit employee.company_assigned audit
  → employee can attend (resolveAttendanceCompanyId works)
```

---

## 5. Legal Entity Model

### 5.1 Collection: `biz_company_profile` (unchanged name)

**Role:** Single Source of Truth for Legal Entity / Entitas Administratif.

### 5.2 Field model

| Field | Status | Purpose |
|-------|--------|---------|
| `id` | existing | PK |
| `company_name` | existing | Primary display name (UI label) |
| `legal_name` | existing | Registered legal name |
| `code` | existing | Short code (SDI, LOCAL) |
| `is_active` | existing | Soft disable |
| `entity_type` | **NEW** | Classification (see §5.3) |
| `npwp`, `address`, `city`, `phone`, `email`, `website` | existing | Legal/admin contact |
| `show_npwp_on_documents`, `npwp_display_mode` | existing | Document identity |
| `timezone` | **OPTIONAL defer** | Only if work schedule needs entity-level TZ |
| `created`, `updated` | PB system | Audit metadata |

**Do NOT add** in 34C unless proven needed: fiscal year, chart of accounts, payroll settings (those belong to accounting/payroll modules as consumer config).

### 5.3 `entity_type` enum

```
PT | CV | FIRMA | YAYASAN | KOPERASI | NON_PT | OTHER
```

- Stored as `select` on PB (maintainable, not free text).
- Default backfill for existing rows: `PT` (local migration only).
- UI label: **"Jenis Entitas"** — attribute of Legal Entity, not HR.

### 5.4 Entity status rules

| State | New assignment | New transactions | Historical refs |
|-------|----------------|------------------|-----------------|
| `is_active=true` | ✅ Allowed | ✅ Allowed | ✅ |
| `is_active=false` | ❌ Blocked | ❌ Block new ops requiring active entity | ✅ Preserved |

**Never** hard-delete entity with references. Deactivate only.

---

## 6. Organization Model

### 6.1 Definition

**Organization** answers: *"Bagian organisasi mana yang mengelola pekerjaan ini?"*

In current SERBA, organization is **not** a hierarchical tree master. It is:

- **Labels** on `profiles`: `department`, `division` (optional text, sourced from `hr_employee_options`)
- **Functional areas** in business modules (Finance, Warehouse) — separate domain masters

### 6.2 Design decision

**Phase 34C:** Do **not** create `organization_units` collection.

| Need | Solution |
|------|----------|
| Department list | `hr_employee_options` category `department` |
| Division list | `hr_employee_options` category `division` |
| Org hierarchy tree | **DEFER** — future phase if Owner requires BU/division tree |
| Manager chain | `profiles.manager` (reporting, not org master) |

### 6.3 Rules

- Department/Division **optional** — small company leaves null.
- Legal Entity **must not** substitute department/division/position.
- Changing department does **not** change Legal Entity membership.

---

## 7. Position Model

### 7.1 Definition

**Position** answers: *"Apa jabatan orang ini?"* — job title, **not** system role.

### 7.2 Implementation

| Layer | Source |
|-------|--------|
| Master options | `hr_employee_options` where `category = position` |
| Employee value | `profiles.position` (string, selected from options) |
| System role | `users.role_code` / capabilities — **separate** |

### 7.3 Rule

**Position = Manager** does **not** grant manager authority. Actual authority comes from:

- `profiles.manager` (reporting)
- Capabilities (`employee.view_team`, etc.)
- Company scope

---

## 8. Work Location Model

### 8.1 Definition

**Work location** answers: *"Di mana pekerjaan dilakukan secara fisik?"*

### 8.2 Implementation

| Item | Collection | Notes |
|------|------------|-------|
| Location master | `offices` | name, code, lat/lng/radius, timezone, is_active |
| Employee assignment | `profiles.office_id` | Required for attendance geofence |
| Legal Entity link | **None today** | Optional future: `offices.company` FK |

### 8.3 Rules

- **1 Legal Entity ≠ 1 location** — one PT may have many offices.
- Attendance uses **office** for GPS, **entity** for legal stamp — both required, different jobs.
- Phase 34C: **reuse** `/hr/offices`; add nav under Master Data as link (no schema change for offices unless Owner approves optional `company` FK in later sub-phase).

---

## 9. Employee Membership Model

### 9.1 Collection: `biz_user_companies`

| Field | Status | Purpose |
|-------|--------|---------|
| `user` | existing | Employee user ID |
| `company` | existing | → `biz_company_profile.id` |
| `is_active` | existing | Soft disable membership |
| `is_primary` | **NEW** | Primary administrative entity |

### 9.2 Semantics

- Employee may have **0..N** active memberships.
- Exactly **one** `is_primary=true` among active memberships (when N ≥ 1).
- Membership defines **authorization scope** and **attendance disambiguation**.
- Removing last membership → fail closed for HR-scoped ops and attendance.

### 9.3 Relationship to `users.default_company` / `active_company`

See §10 Primary Entity Rule.

---

## 10. Primary Entity Rule

### 10.1 Problem

Today three sources compete:

1. `biz_user_companies` (no primary flag)
2. `users.default_company`
3. `users.active_company`

Plus work-context fallback in `lib/tenant/company-access.ts`.

### 10.2 Design decision — single source of truth

```
CANONICAL PRIMARY = biz_user_companies row where is_primary = true AND is_active != false
```

| Field | Role after 34C |
|-------|----------------|
| `biz_user_companies.is_primary` | **Source of truth** for primary administrative entity |
| `users.default_company` | **Denormalized cache** — synced from primary on membership change |
| `users.active_company` | **Work session pointer** — which entity user is operating under in bisnis/finance UI; NOT primary truth |

### 10.3 Constraints

```sql
-- Logical constraints (enforced server-side)
-- For each user with ≥1 active membership:
--   COUNT(is_primary = true) = 1
--   is_primary row must have is_active != false
--   primary.company must be in user's active membership set
```

### 10.4 Resolution algorithms

**Attendance** (`resolveAttendanceCompanyId`) — updated logic:

```
memberships = active biz_user_companies for user
IF count == 0 → 403 (owner fallback unchanged)
IF count == 1 → that company
IF count > 1 → row where is_primary = true
IF no primary flagged → 403 with HR message (no guess)
```

**Payroll (future):** Read primary at period lock time; stamp `payroll_items.company_id`.

**Work context switch:** User may set `active_company` to any **member** entity; does not change primary.

### 10.5 Fallback during migration (local only)

One-time backfill order:

1. If exactly one active membership → set `is_primary=true`.
2. If multiple: if `users.default_company` ∈ memberships → primary = that.
3. Else if `users.active_company` ∈ memberships → primary = that.
4. Else → primary = oldest membership by `created`.
5. Sync `users.default_company` = primary.

### 10.6 Deactivation / deletion

| Action | Behavior |
|--------|----------|
| Deactivate membership | Set `is_active=false`, clear `is_primary` on that row; re-elect primary if needed |
| Remove membership | Delete row only if another primary exists or user has other memberships |
| Deactivate entity | Existing memberships remain for history; block **new** assignments to that entity |
| Delete entity | **Forbidden** if any FK reference exists |

---

## 11. Authorization Matrix

### 11.1 New capabilities (`lib/capabilities/master-data.ts`)

| Capability | Scope | Owner | HR | Manager | Staff |
|------------|-------|-------|-----|---------|-------|
| `master_data.entity.view` | COMPANY (own memberships) / ALL (owner) | ✅ | ✅ view in scope | ❌ | ❌ |
| `master_data.entity.manage` | ALL | ✅ | ❌ | ❌ | ❌ |
| `master_data.entity.activate` | ALL | ✅ | ❌ | ❌ | ❌ |
| `master_data.location.view` | ALL | ✅ | ✅ | ❌ | ❌ |
| `master_data.location.manage` | ALL | ✅ | ✅ | ❌ | ❌ |
| `master_data.org_options.manage` | ALL | ✅ | ✅ | ❌ | ❌ |
| `master_data.membership.assign` | COMPANY | ✅ | ✅ scoped | ❌ | ❌ |
| `master_data.membership.set_primary` | COMPANY | ✅ | ✅ scoped | ❌ | ❌ |

**Notes:**

- HR **cannot** `master_data.entity.manage` unless Owner grants explicitly in future.
- Manager status does **not** imply any master data capability.
- Existing `employee.create` / `employee.update` remain; membership assign uses `master_data.membership.assign`.

### 11.2 Server enforcement points

| Operation | API | Checks |
|-----------|-----|--------|
| Create entity | `POST /api/master-data/legal-entities` | `master_data.entity.manage` |
| Update entity | `PATCH .../legal-entities/[id]` | manage + cannot rename if HR |
| Deactivate entity | `POST .../deactivate` | manage |
| Assign membership | `POST /api/hr/employees/[id]/membership` | `membership.assign` + entity in actor scope + entity active |
| Set primary | same API | `membership.set_primary` + target membership in scope |
| HR onboarding entity select | `POST /api/hr/employees` | entity_id in actor scope, active |

### 11.3 Client trust boundaries

**Reject from client body:**

- `company_id` on attendance (already)
- Entity IDs outside actor scope
- `is_primary` without authorization
- Direct PB writes to `biz_company_profile` from HR session (route through API)

---

## 12. Small Company Scenario

```
Owner (account_type=owner)
├── Legal Entity: PT ABC (single row, entity_type=PT)
├── Membership: Owner → PT ABC (primary)
└── Staff Budi
    ├── membership → PT ABC (primary)
    ├── manager → null
    ├── department → null
    ├── office → Kantor PT ABC
    └── role → staff
```

| Workflow | Valid? |
|----------|--------|
| Owner creates entity | ✅ |
| Owner creates staff without HR role | ✅ |
| Staff check-in | ✅ server resolves PT ABC |
| No department/divisi | ✅ |
| No manager | ✅ |
| Payroll (future) | Uses primary entity |

**No HR role required** for any master data or employee workflow.

---

## 13. Large Company Scenario

```
Legal Entities:
  PT Retail (primary for some staff)
  PT Warehouse
  CV Trading

Organization (labels, not tree):
  HR, Finance, Warehouse, Retail

HR Retail (membership: PT Retail only)
  → can assign PT Retail to new employees
  → cannot assign PT Warehouse

Group HR (memberships: PT Retail + PT Warehouse)
  → can assign either, must pick explicitly on onboarding

Manager Ops (membership: PT Warehouse)
  → team attendance = hierarchy ∩ PT Warehouse
```

---

## 14. HR Integration

### 14.1 Employee create (`/hr/employees/new`)

**Replace** best-effort actor company inference.

| HR scope | UI behavior |
|----------|-------------|
| 0 entities | Fail closed — cannot create employee |
| 1 entity | Auto-select, show read-only |
| 2+ entities | **Required select** — "Entitas Administratif *" |

**Server:**

```typescript
POST /api/hr/employees
  body: { ..., primary_entity_id: string, additional_entity_ids?: string[] }
  → validate entities active + in actor scope
  → create user + profile
  → create biz_user_companies rows (one is_primary)
  → sync users.default_company
  → audit employee.company_assigned
```

### 14.2 Employee edit (`/hr/employees/[id]`)

Replace read-only "Perusahaan (PT)" with:

- **Primary entity** — select (scoped) if `membership.assign`
- **Additional memberships** — multi-select optional (advanced, collapsible)
- Helper: *"Digunakan untuk administrasi, payroll, dan dokumen. Bukan struktur operasional."*

**Kantor** remains separate field (work location).

### 14.3 HR navigation

HR **does not** get entity master CRUD in sidebar.

HR **does** get:

- Employee form entity select (consumption)
- Optional read-only link: "Lihat entitas dalam scope" (list only)

Membership bulk matrix remains at `/pengaturan/akses-entitas` — **Owner primary**; HR access TBD (recommend: view + assign via employee form only, not full matrix).

---

## 15. Attendance Integration

**No changes to client contract.**

| Rule | Status |
|------|--------|
| No PT selector on check-in/out | Maintain |
| `company_id` server-only | Maintain |
| `resolveAttendanceCompanyId()` | Update to use `is_primary` |
| Historical `attendance_logs.company_id` | Immutable after check-in |
| Schedule snapshot (34B) | Unchanged |

**Employee entity change after check-in:** Past attendance records **unchanged** — stamped `company_id` at event time.

---

## 16. Payroll Integration

### 16.1 Current state

- `payroll_items` → `profile`, `user` — **no company FK**
- Slip branding hardcoded — not entity-aware

### 16.2 Design (implementation deferred)

```
payroll_items.company_id  → biz_company_profile (stamped at period lock)
payroll_periods.company_id → optional if periods are per-entity
```

**Legal Entity Snapshot on payslip:**

| Field | Source at lock time |
|-------|---------------------|
| `company_id` | Employee primary entity |
| `legal_name_snapshot` | From profile at lock |
| `npwp_snapshot` | From profile at lock |

Phase 34C: **document + schema placeholder in design**; implement stamping in **Payroll Phase** following 34C.

---

## 17. Accounting Integration

### 17.1 Current state ✅

- `lib/bisnis/entity-resolve.ts` resolves company from SO/invoice/warehouse/cash
- Finance UI scopes via `WorkContextProvider.companyId`
- Inter-company transfers use `from_company` / `to_company`

### 17.2 Phase 34C impact

| Change | Impact |
|--------|--------|
| Add `entity_type` to master | None on existing journals |
| Rename UI label | Cosmetic |
| Server API for entity CRUD | Replace direct PB client — same collection |
| Primary membership rule | None on posted transactions |

**Do not** add accounting-specific fields to `biz_company_profile` unless they are true legal attributes (NPWP already qualifies).

Fiscal settings / COA → future **Accounting module config** keyed by `company` FK.

---

## 18. Inventory Integration

| Concept | Collection | Relationship to Legal Entity |
|---------|------------|------------------------------|
| Warehouse | `inv_warehouses` | `company` FK — consumer |
| Stock | product × warehouse | scoped by warehouse → company |
| Zone | inventory zones | warehouse scope |

**Rule:** Warehouse is **operational unit**, not legal entity. Do not merge.

Phase 34C: **audit only** — no schema changes.

---

## 19. Sales / Purchase Integration

| Module | Company usage |
|--------|---------------|
| Sales orders / invoices | `company` stamped on create |
| Purchase orders / bills | `company` stamped |
| Returns / credit notes | derived from source doc company |
| Reports | `mergeCompanyFilter` |

Phase 34C: **no changes** — verify regression tests pass.

---

## 20. POS Integration

| Item | Notes |
|------|-------|
| POS registers | Scoped to store → company |
| Sales from POS | Uses work context company |

Phase 34C: **audit only** — no POS master duplication.

---

## 21. UI / Navigation

### 21.1 Target information architecture

```
PENGATURAN
├── Indeks Pengaturan
├── MASTER DATA                    ← new grouping (nav layer)
│   ├── Entitas Administratif      ← /pengaturan/perusahaan (renamed label)
│   ├── Kantor / Lokasi            ← link → /hr/offices (reuse)
│   ├── Departemen                 ← link → manage hr_employee_options?category=department
│   ├── Divisi                     ← link → manage hr_employee_options?category=division
│   └── Jabatan                    ← link → manage hr_employee_options?category=position
├── Akses Entitas                  ← membership matrix (Owner; HR policy TBD)
├── Peran & Izin
├── Notifikasi
└── … (existing bisnis/integrasi/audit — unchanged)
```

### 21.2 Implementation approach

- **Navigation consolidation only** — no destructive data move.
- Add `MASTER_DATA_NAV_ITEMS` in `lib/wms/navigation.ts`.
- Owner sees full Master Data group.
- HR sees: Kantor + Org options (existing HR access); **not** Entitas Administratif CRUD.

### 21.3 Label changes

| Old | New |
|-----|-----|
| Perusahaan | Entitas Administratif |
| Perusahaan (PT) on employee form | Entitas Administratif |

---

## 22. Access Preview

### 22.1 Current (`buildEmployeeAccessPreview`)

Mixes profile org fields with `company_scope` (actor scope, not employee memberships).

### 22.2 Target sections (separated)

```typescript
AccessPreviewResult {
  legal_entity: {
    memberships: { company_id, name, code, entity_type, is_primary }[]
    primary_entity_id: string | null
  }
  organization: {
    department, division, position,
    manager_user_id, manager_name
  }
  work: {
    office_id, office_name,
    work_schedule_summary?
  }
  security: {
    role_code, capabilities[], scopes[],
    sensitive_data_access, mobile_access[]
  }
}
```

UI: four cards — **do not merge** Legal Entity with Organization or Work.

---

## 23. Audit Events

### 23.1 Entity events

| Event code | Trigger |
|------------|---------|
| `company.created` | New `biz_company_profile` |
| `company.updated` | Field change (safe diff) |
| `company.activated` | `is_active` → true |
| `company.deactivated` | `is_active` → false |

**Payload (safe):** `{ entity_id, code, company_name, entity_type, changed_fields[] }`  
**Never log:** passwords, NIK, NPWP employee, secrets.

### 23.2 Employee membership events

| Event code | Trigger |
|------------|---------|
| `employee.company_assigned` | New membership |
| `employee.company_removed` | Membership removed/deactivated |
| `employee.primary_company_changed` | Primary flag moved |

**Payload:** `{ target_user_id, company_id, company_code, is_primary, actor_id }`

### 23.3 Storage

- Prefer `sys_audit_log` + `biz_activity_events` (existing).
- Module: `master_data` or `settings`.

---

## 24. Historical Data Strategy

### 24.1 Immutability principle

Once finalized, these **never rewrite** when master or employee assignment changes:

| Domain | Stamped field | When stamped |
|--------|---------------|--------------|
| Attendance | `attendance_logs.company_id` + schedule snapshot | Check-in (34B) |
| Payroll | `payroll_items.company_id` (future) | Period lock |
| Sales/Purchase | `company` on document | Document create/post |
| Finance | `company` on expense/journal | Posting |

### 24.2 Master deactivation

- Entity `is_active=false` → historical FKs remain valid.
- UI shows inactive badge on historical records.
- Reports include inactive entity in historical filters.

### 24.3 Employee transfer between entities

```
Before: primary = PT A
Action: HR changes primary to PT B (effective date optional — defer)
After:
  - New attendance → PT B
  - Old attendance → still PT A
  - New payroll → PT B
  - Old payslips → PT A snapshot
```

Optional future: `membership.effective_from` — **defer** beyond 34C unless Owner requires.

---

## 25. Security

### 25.1 Server-authoritative checklist

- [ ] All entity CRUD via `/api/master-data/*` with capability check
- [ ] All membership changes via HR API with scope check
- [ ] `primary_entity_id` validated server-side
- [ ] Inactive entity rejected on assign
- [ ] Client PB direct writes blocked by PB rules (Phase 34C+ hardening)
- [ ] Attendance client `company_id` rejected (existing 34B)
- [ ] Privilege fields on `users` remain server-only

### 25.2 Fail closed

| Condition | Result |
|-----------|--------|
| HR with 0 entity scope | Cannot create employee |
| Employee with 0 membership | Cannot check-in |
| Multi membership, no primary | Cannot check-in |
| Assign entity outside scope | 403 |

---

## 26. Migration Strategy

### 26.1 Scope

**LOCAL ONLY** for Step 3. Production/staging **untouched**.

### 26.2 Idempotent local migration script

`scripts/migrate-local-master-data-phase34c.mjs`:

1. Add `entity_type` select to `biz_company_profile` (default `PT`).
2. Add `is_primary` bool to `biz_user_companies`.
3. Backfill `entity_type` for existing profiles.
4. Backfill `is_primary` + sync `users.default_company` (see §10.5).
5. **Do not** rename collections or fields.

### 26.3 Rollback

- New fields nullable / have defaults.
- Removing `is_primary` possible before production if needed (local only).

### 26.4 Production path (future — not 34C)

After local UAT + staging UAT:

1. Staging migration
2. Staging UAT
3. Production migration (Owner approval)
4. No APK required for 34C

---

## 27. Backward Compatibility

| Area | Compatibility |
|------|---------------|
| Existing `biz_company_profile` rows | Backfill `entity_type=PT` |
| Single-entity employees | Auto primary |
| Accounting documents | Unchanged FK |
| Attendance 34B tests | Must pass with primary rule |
| Work context API | `active_company` still works |
| `company-client.ts` | Deprecate after server API; shim during transition |
| HR employee form | Add select — breaking UX improvement, not data break |
| Mobile | No change required if server contract stable |

---

## 28. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Primary rule migration edge cases | Medium | Attendance 403 | Idempotent backfill + clear HR UI |
| HR confusion (entity vs office) | Medium | Wrong data entry | Separate form sections + helper text |
| Dual scope tenant vs HR | Medium | Authorization bug | Document; use same membership for HR assign |
| Client PB bypass | Medium | Security | Server API + future PB write rules |
| Schema drift local/prod | Medium | Migration fail | Single script chain |
| Scope creep into payroll | High | Delay | Defer payroll stamping |
| Office→entity FK request | Low | Complexity | Defer optional FK |

---

## 29. Test Plan

### 29.1 New Phase 34C tests (`scripts/test-phase34c-master-data.mjs`)

**Entity master**

- [ ] Owner can create entity
- [ ] Authorized admin with `master_data.entity.manage` can create
- [ ] HR cannot create entity (403)
- [ ] HR cannot rename entity via API (403)
- [ ] HR can list entities in scope
- [ ] HR cannot select entity outside scope
- [ ] Inactive entity cannot be assigned to new employee

**Employee membership**

- [ ] Employee can have primary entity
- [ ] Employee can have multiple memberships
- [ ] Exactly one primary enforced
- [ ] Changing primary is audited
- [ ] Historical attendance unchanged after primary change

**Attendance (34B regression)**

- [ ] No entity selector on API contract
- [ ] `company_id` server-resolved via primary
- [ ] Client `company_id` injection rejected

**Small / large company**

- [ ] No HR, no manager, no dept — employee works
- [ ] Multi-entity scoped HR — assign correct PT only

### 29.2 Regression suites (must pass)

Phase 31, 32, 33A, 33B, 34B, TypeScript, mobile capabilities.

---

## 30. Deferred Items

| Item | Target phase |
|------|--------------|
| Payroll `company_id` stamping + slip snapshot | Payroll phase |
| `offices.company` optional FK | Post-34C if needed |
| Organization tree (`organization_units`) | Future org phase |
| PB write-lock on all master collections | 34C+ hardening |
| `membership.effective_from` date | Future HR transfer |
| Group HR explicit grant table | Future if union membership insufficient |
| `entity_type` on documents beyond NPWP | Document identity phase |
| Full Master Data admin for HR (entity CRUD) | Only if Owner grants capability |
| Production/staging migration | Post local UAT |
| APK / mobile UI changes | Not required for 34C |

---

## 31. Phase 34C Step 3 Recommendation

### 31.1 Implementation order (local only)

| Priority | Task |
|----------|------|
| P0 | Local migration: `entity_type`, `is_primary`, backfill |
| P0 | `lib/capabilities/master-data.ts` + auth helpers |
| P0 | `app/api/master-data/legal-entities/*` server CRUD |
| P0 | `lib/master-data/membership.ts` + HR assign API |
| P1 | Update `resolveAttendanceCompanyId` → primary rule |
| P1 | Employee onboard/edit — entity select UI |
| P1 | Audit events |
| P2 | Navigation — Master Data group + label rename |
| P2 | Access Preview restructure |
| P2 | Migrate `pengaturan/perusahaan` to server API |
| P3 | Phase 34C test script + full regression |

### 31.2 Files expected (preview)

```
lib/master-data/legal-entity.ts          (new)
lib/master-data/membership.ts            (new)
lib/master-data/entity-audit.ts          (new)
lib/capabilities/master-data.ts          (new)
lib/hr/employment-scope.ts               (modify — primary rule)
lib/hr/employee-onboarding-server.ts     (modify — entity select)
app/api/master-data/legal-entities/**    (new)
app/api/hr/employees/[id]/membership/**  (new)
components/hr/HrEntitySelectField.tsx    (new)
app/(dashboard)/hr/employees/new/**      (modify)
app/(dashboard)/hr/employees/[id]/**     (modify)
app/(dashboard)/pengaturan/perusahaan/** (modify — server API)
lib/wms/navigation.ts                    (modify — Master Data nav)
scripts/migrate-local-master-data-phase34c.mjs (new)
scripts/test-phase34c-master-data.mjs    (new)
docs/PHASE_34C_IMPLEMENTATION_REPORT.md  (after Step 3)
```

### 31.3 Gate after Step 3

**READY FOR LOCAL UAT** — not staging until Owner approves local UAT checklist.

---

## Appendix A — Cross-Module Dependency Map

```
biz_company_profile
  ├── biz_user_companies → users (membership)
  ├── users.default_company / active_company (pointers)
  ├── attendance_logs.company_id
  ├── hr_work_schedules.company
  ├── biz_* transactional FKs
  └── document identity / NPWP display

offices ← profiles.office_id ← attendance GPS
hr_employee_options ← profiles.dept/div/position
profiles.manager ← hierarchy (not entity)
```

---

## Appendix B — Owner Decision Checklist

Before Step 3, Owner confirms:

- [ ] `biz_company_profile` remains single Legal Entity master (**recommended: YES**)
- [ ] Primary entity = `biz_user_companies.is_primary` + sync `default_company` (**recommended: YES**)
- [ ] HR can assign entity on employee form but **not** create PT (**recommended: YES**)
- [ ] `entity_type` enum as designed (**recommended: YES**)
- [ ] Office→entity FK deferred (**recommended: DEFER**)
- [ ] Payroll stamping deferred (**recommended: DEFER**)
- [ ] HR access to `/pengaturan/akses-entitas` matrix (**decide: Owner-only vs HR read-only**)

---

*Step 1 audit: `docs/PHASE_34C_ENTITY_MASTER_AUDIT.md`*  
*Phase 34B attendance: `docs/PHASE_34B_ATTENDANCE_IMPLEMENTATION_REPORT.md`*
