# Phase 34E — Payslip Privacy & Employee Private Documents

**Status:** READY FOR LOCAL UAT  
**Scope:** LOCAL ONLY — no staging, production, or APK changes.

## Architecture

```
biz_company_profile (SSOT)
        ↓
biz_user_companies.is_primary
        ↓
Employee membership
        ├──────────────────────┐
        ▼                      ▼
   PAYROLL (payroll_items)   hr_employee_documents
        │                      │
        ▼                      ▼
   Entity snapshot          KTP / NPWP / KK / Bank
   at period lock           (versioned via is_current)
        │
        ▼
   Server API auth (no client employee_id trust)
```

### Entity resolution

- Payslip company name comes from **snapshot fields** on `payroll_items` stamped at period approval (`stampAllPayrollItemsInPeriod`).
- Source at stamp time: `biz_user_companies.is_primary` → `biz_company_profile`.
- **Not used:** `users.active_company`, client-supplied `company_id`, browser state.
- Historical immutability: once `company_name_snapshot` is set, it is not overwritten unless `force=true`.

## Files changed / added

| Area | Files |
|------|-------|
| Capabilities | `lib/capabilities/payroll.ts`, `lib/capabilities/employee-document.ts`, `lib/capabilities/index.ts` |
| Payslip server | `lib/hr/payroll-server.ts`, `lib/hr/payroll-entity-snapshot.ts`, `lib/hr/payroll-slip-pdf.ts`, `lib/hr/payroll-audit.ts` |
| Payslip API | `app/api/payroll/self/slips/route.ts`, `[id]/route.ts`, `[id]/pdf/route.ts` |
| Period stamp | `app/api/hr/payroll/periods/[id]/stamp-snapshots/route.ts`, hook in `lib/payroll.ts` |
| Staff UI | `app/(dashboard)/dashboard-staff/payroll/page.tsx`, `lib/payroll-client.ts` |
| Documents | `lib/hr/document-validate.ts`, `lib/hr/employee-document-server.ts`, `lib/hr/employee-document-audit.ts` |
| Document API | `app/api/profile/self/documents/route.ts`, `[id]/file/route.ts` |
| Profile UI | `components/profile/EmployeePrivateDocumentsSection.tsx`, wired in `components/EmployeeSelfProfile.tsx` |
| Migration | `scripts/migrate-local-hr-phase34e.mjs` |
| Demo seed | `scripts/seed-local-phase34e-demo-payslips.mjs` |
| Tests | `scripts/test-phase34e-payslip-documents.mjs` |

## Schema changes (local migration)

### `payroll_items` (new fields)

- `company_id`, `company_name_snapshot`, `company_code_snapshot`, `entity_type_snapshot`
- `company_address_snapshot`, `company_npwp_snapshot`
- `employee_code_snapshot`, `department_snapshot`
- `is_demo`, `demo_seed_key`

### `payroll_periods` (new fields)

- `is_demo`, `demo_seed_key`

### `hr_employee_documents` (new collection)

- `user`, `document_type` (ktp/npwp/kk/bank_account/other)
- `file`, `original_name`, `mime_type`
- `is_current`, `replaced_document_id`, `replaced_at`

## Commands

```bash
npm run migrate:local-hr-phase34e
npm run seed:local-phase34e-demo-payslips   # requires fn2@gmail.com locally
npm run test:phase34e-payslip-documents
```

## Authorization matrix

| Actor | Payslip self | Payslip others | Documents self | Documents others |
|-------|-------------|----------------|----------------|------------------|
| Staff | ✓ | ✗ | ✓ upload/view | ✗ |
| Manager | ✓ | ✗ (default) | ✓ upload/view | ✗ |
| HR | ✓ | ✓ in entity scope | ✓ | ✓ in entity scope |
| Owner | ✓ | ✓ all entities | ✓ | ✓ all entities |

Capabilities: `payslip.view_self`, `payslip.download_self`, `payslip.view_scoped`, `payslip.download_scoped`, `payslip.manage`, `employee_document.*`.

## Payslip privacy

- List/get/PDF via `/api/payroll/self/slips/*` only.
- Server resolves authenticated user; ignores client `employee_id`.
- PDF/HTML served with `Cache-Control: no-store, private` — no public URLs.
- Audit: `payslip.viewed`, `payslip.downloaded` (no salary amounts in payload).

## Document privacy

- Upload/list via `/api/profile/self/documents`.
- File access via `/api/profile/self/documents/[id]/file` with session auth.
- Validation: PDF/JPEG/PNG, magic bytes, extension check, max 10 MB.
- Replace marks previous record `is_current=false` (audit trail).
- Audit: `employee_document.uploaded|viewed|downloaded|replaced` (no file content).

## Demo data

- Target: `fn2@gmail.com` (must exist — seed **STOP** if missing).
- 3 most recent calendar months from run date.
- Idempotent via `demo_seed_key = phase34e-demo-fn2:YYYY-MM`.
- Marked `is_demo=true` on period and item.

## PDF / preview

- HTML payslip with CONFIDENTIAL / RAHASIA header.
- Company name, employee name, period, components, THP.
- Preview: iframe to `/api/payroll/self/slips/[id]/pdf?inline=1`.
- Download: same route without inline (attachment).

## Tests

```bash
npm run test:phase34e-payslip-documents
```

Covers: capabilities, ownership denial, snapshot immutability, file validation, demo key logic.

## Known limitations

- PDF download returns print-ready HTML (not binary PDF engine) — opens correctly in browser/print-to-PDF.
- Optional payslip PIN lock **deferred** (no existing lightweight PIN architecture).
- HR document scoping uses target user's primary entity membership.
- `fn2@gmail.com` must be provisioned locally before demo seed.

## UAT checklist

### A. Staff (fn2@gmail.com)

1. Login → `/dashboard-staff` → Slip Gaji
2. See 3 periods with company name, employee name, THP
3. Preview each slip — company + employee visible
4. Download each slip

### B. Privacy

- Manipulate payslip ID in URL → 403/DENIED for other users' slips

### C. Profile

- `/profile` → Dokumen Pribadi
- Upload KTP + NPWP, preview/download own files only

### D. Security

- Direct PocketBase file URL without session → DENIED
- `/api/profile/self/documents/[id]/file` without auth → 401

## Gate

**READY FOR LOCAL UAT** — await Owner approval before staging/production/APK.
