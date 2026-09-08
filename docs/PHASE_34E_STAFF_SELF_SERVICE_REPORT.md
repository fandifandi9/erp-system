# Phase 34E — Staff Self-Service, Payroll Privacy & HR Policy Center

**Status:** READY FOR LOCAL UAT  
**Scope:** LOCAL ONLY — staging, production, and APK untouched.

## Implementation Plan (executed)

| Part | Approach |
|------|----------|
| A Profile/Avatar | Reuse Phase 34D server API; `UserAvatar` with initials fallback; Navbar via `/api/profile/self` |
| B Profile info | Employment read-only from `biz_user_companies.is_primary` → `biz_company_profile` |
| C Documents | `hr_employee_documents` + server-mediated file access + verification status |
| D Payslips | Existing `/dashboard-staff/payroll` hardened with server API + entity snapshot |
| E Demo payslips | Idempotent seed for `fn2@gmail.com` — 3 recent months |
| F–G HR policies | New `hr_policies` collection — entity-scoped, draft/published |
| H Holidays | Extended `office_holidays` with `company_id`, type, description |
| I Notifications | Extended Phase 24 `notifications` — policy/holiday/payslip/document events |
| J Dashboard | Grouped cards: Personal, Kehadiran, Penggajian, Informasi Perusahaan |

## Architecture Audit

### Reused (no duplicate master)

- `biz_company_profile` — SSOT entity
- `biz_user_companies.is_primary` — employee administrative entity
- `payroll_items` / `payroll_periods` — existing payroll engine
- `office_holidays` — extended with entity scope (not duplicated)
- `notifications` — Phase 24 dispatch
- `profiles.avatar` — Phase 34D self-service upload

### New collections / fields (local migration)

| Resource | Fields |
|----------|--------|
| `hr_policies` | title, category, content, status, effective_from, company_id, published_by/at, is_demo, demo_seed_key |
| `office_holidays` | + company_id, holiday_type, description, is_demo, demo_seed_key |
| `hr_employee_documents` | + verification_status (pending/verified/rejected/needs_replacement) |
| `payroll_items` | entity snapshot fields (Phase 34E prior) |

## Authorization Matrix

| Resource | Staff | Manager | HR | Owner |
|----------|-------|---------|-----|-------|
| Own avatar/profile | ✓ edit self | ✓ | ✓ | ✓ |
| Own payslip | ✓ | ✓ self only | scoped | all |
| Other payslip | ✗ | ✗ | scoped | all |
| KTP/NPWP own | ✓ | ✓ | ✓ | ✓ |
| KTP/NPWP others | ✗ | ✗ | scoped | all |
| Published policies | ✓ read | ✓ read | ✓ manage | ✓ manage |
| Holidays | ✓ read scoped | ✓ read | ✓ manage | ✓ manage |

Capabilities: `payslip.*`, `employee_document.*`, `hr_policy.view_published`, `hr_policy.manage`.

## Privacy Model

- All sensitive reads via server routes — session auth only
- No client `employee_id`, `company_id`, or payroll ID without ownership check
- Document/payslip files: `Cache-Control: no-store, private`
- Notifications: generic text; detail requires re-auth at target screen

## Key Routes

| Route | Purpose |
|-------|---------|
| `/profile` | Profil, kepegawaian, dokumen, akun |
| `/dashboard-staff/payroll` | Slip gaji (private) |
| `/dashboard-staff/policies` | Aturan & Informasi HR |
| `/dashboard-staff/holidays` | Kalender & Hari Libur |
| `/hr/policies` | HR kelola kebijakan |
| `/api/payroll/self/slips/*` | Payslip server API |
| `/api/profile/self/documents/*` | Document server API |
| `/api/hr/policies/published` | Staff policy read |
| `/api/hr/holidays/published` | Staff holiday read |

## Commands

```bash
npm run migrate:local-hr-phase34e
npm run seed:local-phase34e-demo-payslips
npm run seed:local-phase34e-staff-uat
npm run test:phase34e-payslip-documents
npm run test:phase34d-profile
npm run test:phase34c-master-data
npm run test:phase34-attendance
```

## UAT Account

- Email: `fn2@gmail.com`
- Entity: PT. Serba Digital Indonesia (from primary membership)
- Demo: 3 payslips, 2 policies, 2 holidays, notifications

## Test Results

Run locally after implementation:

- Phase 34E unit tests: payslip privacy, documents, policies, artifacts
- Phase 34D: 34/34 regression
- TypeScript: `npx tsc --noEmit`

## Known Limitations

- Payslip download = print-ready HTML (not binary PDF engine)
- Policy late-deduction example uses profile `late_deduction_rupiah_per_minute` when configured
- Optional payslip PIN deferred
- HR holiday create on work-calendar page still global client — new `/api/hr/holidays` for entity-scoped + notifications

## Explicit Confirmation

- **LOCAL ONLY** — all migrations/seeds block non-local PocketBase URLs
- **STAGING UNTOUCHED**
- **PRODUCTION UNTOUCHED**
- **APK UNTOUCHED**

## Gate

**READY FOR LOCAL UAT** — await Owner approval before staging/production/APK.

See also: [PHASE_34E_PAYSLIP_DOCUMENT_PRIVACY_IMPLEMENTATION_REPORT.md](./PHASE_34E_PAYSLIP_DOCUMENT_PRIVACY_IMPLEMENTATION_REPORT.md)
