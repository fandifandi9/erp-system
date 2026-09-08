# Phase 34C — System Master Data & Legal Entity (Local Implementation)

**Date:** 2026-08-31  
**Mode:** LOCAL ONLY  
**Status:** COMPLETE (automated verification)

---

## FINAL GATE

# ✅ READY FOR LOCAL UAT

**NOT** READY FOR STAGING · **NOT** READY FOR PRODUCTION · **NO APK**

---

## Owner Decisions Implemented

| Decision | Implementation |
|----------|----------------|
| SSOT = `biz_company_profile` | Extended, no duplicate collections |
| HR read-only entity view in scope | `GET /api/master-data/legal-entities` + `/pengaturan/entitas-administratif` |
| HR select entity on onboarding/edit | `HrEntitySelectField` + server membership assign |
| HR cannot CRUD master entity | `master_data.entity.manage` = Owner only |
| Primary entity = `is_primary` | `biz_user_companies.is_primary` + sync `default_company` |
| Attendance unchanged (34B) | `resolveAttendanceCompanyId` uses `is_primary` |
| No attendance PT selector | Unchanged |

---

## Schema Changes (Local PB)

### `biz_company_profile`
| Field | Type | Purpose |
|-------|------|---------|
| `entity_type` | select | PT, CV, FIRMA, YAYASAN, KOPERASI, NON_PT, OTHER |

### `biz_user_companies`
| Field | Type | Purpose |
|-------|------|---------|
| `is_primary` | bool | Primary administrative entity (SSOT) |

**Migration:**
```bash
npm run migrate:local-master-data-phase34c
```

---

## Architecture

```
SYSTEM MASTER DATA (biz_company_profile)
        │
        ├── biz_user_companies (membership + is_primary)
        │
        ├── HR (assign/select scoped)
        ├── Attendance (company_id server stamp)
        ├── Accounting / Inventory / Sales (company FK)
        └── Payroll (deferred stamping)
```

---

## Files Changed (Key)

| Area | Files |
|------|-------|
| Master data core | `lib/master-data/legal-entity.ts`, `membership.ts`, `entity-audit.ts`, `master-data-auth.ts` |
| Capabilities | `lib/capabilities/master-data.ts`, `index.ts` |
| Employment | `lib/hr/employment-scope.ts` (primary rule) |
| Onboarding | `lib/hr/employee-onboarding-server.ts` |
| Employee mutation | `lib/hr/employee-mutation-server.ts`, access preview |
| API | `app/api/master-data/legal-entities/**` |
| UI | `components/hr/HrEntitySelectField.tsx`, onboard + edit pages |
| HR read-only | `app/(dashboard)/pengaturan/entitas-administratif/page.tsx` |
| Nav / RBAC | `lib/wms/navigation.ts`, `lib/rbac.ts` |
| Types | `lib/bisnis/types.ts` (`entity_type`) |
| Migration | `scripts/migrate-local-master-data-phase34c.mjs` |
| Tests | `scripts/test-phase34c-master-data.mjs` |

---

## Authorization Matrix

| Capability | Owner | HR |
|------------|-------|-----|
| `master_data.entity.view` | ✅ all | ✅ scoped |
| `master_data.entity.manage` | ✅ | ❌ |
| `master_data.membership.assign` | ✅ | ✅ scoped |

---

## Test Results

| Suite | Result |
|-------|--------|
| Phase 34C master data | **21/21 PASS** |
| Phase 34B attendance | **18/18 PASS** |
| Phase 33A | **42/42 PASS** |
| Phase 33B | **31/31 PASS** |
| Phase 32 | **35/35 PASS** |
| Phase 31 | **32/32 PASS** |
| Mobile capabilities | **227/227 PASS** |
| TypeScript | **PASS** |

```bash
npm run migrate:local-master-data-phase34c
npm run test:phase34c-master-data
npm run test:phase34-attendance
npm run test:phase33a-user-privilege
npm run test:phase33b-work-schedule
npm run test:phase32-rbac-hardening
npm run test:phase31-employee-rbac
npm run test:mobile-capabilities
npx tsc --noEmit
```

---

## Remaining Limitations

1. **Owner entity CRUD UI** (`/pengaturan/perusahaan`) still uses `company-client.ts` direct PB — server API exists for future wire-up.
2. **Payroll entity stamping** deferred — design documented, no `payroll_items.company_id` yet.
3. **`offices.company` FK** deferred — locations remain global.
4. **Additional memberships UI** on employee edit — primary only in 34C (multi-membership via `/pengaturan/akses-entitas` for Owner).
5. **Production/staging** schema untouched.

---

## Local UAT Checklist

- [ ] Owner: `/pengaturan/perusahaan` — create/edit entity, `entity_type`
- [ ] HR: `/pengaturan/entitas-administratif` — read-only list in scope
- [ ] HR: create employee — select Entitas Administratif (or auto if single)
- [ ] HR: edit employee — change primary entity, save persists
- [ ] Staff check-in — no PT selector; uses primary entity
- [ ] Multi-entity employee without primary → blocked with HR message
- [ ] Access Preview — Legal Entity / Organization / Work / Security sections
- [ ] Accounting/inventory still scoped via work context

---

## Stop Condition Met

- ✅ Local implementation
- ✅ Migration run
- ✅ Full regression pass
- ❌ No staging/production/APK

Awaiting Owner local UAT approval.

---

*Design: `docs/PHASE_34C_SYSTEM_MASTER_DATA_DESIGN.md`*  
*Audit: `docs/PHASE_34C_ENTITY_MASTER_AUDIT.md`*
