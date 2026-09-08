# PHASE 34F — FINAL REFINEMENT REPORT

**Scope:** LOCAL ONLY — no staging, production, APK, or production database changes.

**Status:** READY FOR LOCAL UAT

---

## 1. Audit Summary

| Area | Finding | Action |
|------|---------|--------|
| Bank on `profiles` | Not present | New `hr_payroll_bank_accounts` collection (workflow SSOT) |
| Bank document upload | `hr_employee_documents` type `bank_account` | Reused for optional evidence; not payroll SSOT |
| Payslip snapshots | Entity + policy on `payroll_items` (34E/34F) | Extended with bank + logo snapshot fields |
| Entity logo | Missing on `biz_company_profile` | Added `logo` file field |
| Account verification | Password + 30m session (34F) | Preserved — no PIN reintroduced |
| Payroll formulas | Tested in 34E/34F | Unchanged |

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `lib/hr/payroll-bank-account-types.ts` | Types for bank workflow |
| `lib/hr/payroll-bank-account-utils.ts` | Masking + validation |
| `lib/hr/payroll-bank-account-server.ts` | Server-authoritative bank workflow |
| `lib/hr/payroll-bank-snapshot.ts` | Immutable bank snapshot on payslip |
| `lib/hr/entity-logo-server.ts` | Entity logo upload/fetch SSOT |
| `lib/hr/entity-logo-validate.ts` | Logo MIME/size validation |
| `components/profile/PayrollBankAccountSection.tsx` | Staff bank UI |
| `app/(dashboard)/hr/payroll-bank/page.tsx` | HR approval UI |
| `app/api/profile/self/payroll-bank/route.ts` | Self bank view + request |
| `app/api/hr/payroll-bank-requests/route.ts` | HR pending list |
| `app/api/hr/payroll-bank-requests/[id]/approve/route.ts` | Approve |
| `app/api/hr/payroll-bank-requests/[id]/reject/route.ts` | Reject |
| `app/api/master-data/legal-entities/[id]/logo/route.ts` | Entity logo upload/remove |
| `scripts/migrate-local-hr-phase34f-refinement.mjs` | Local schema migration |
| `scripts/test-phase34f-refinement.mjs` | Automated tests (36 cases) |

## 3. Files Changed

| File | Change |
|------|--------|
| `lib/hr/payroll-slip-pdf.ts` | Professional A4 redesign + bank + logo |
| `lib/hr/payroll-server.ts` | Bank/logo in DTO; stamp bank on view/lock |
| `lib/hr/payroll-entity-snapshot.ts` | `company_logo_snapshot` |
| `components/EmployeeSelfProfile.tsx` | Bank section in tab Pribadi |
| `components/hr/EvidencePicker.tsx` | Camera modal fix (TS) |
| `app/api/account/verify/route.ts` | Password field allowed (prior fix) |
| `package.json` | New migrate/test scripts |

## 4. Files Removed

None.

---

## 5. Database / Schema Changes (LOCAL)

**New collection:** `hr_payroll_bank_accounts`
- user, bank_name, account_number, account_holder_name
- status: `active` | `pending` | `inactive` | `rejected`
- note, evidence_document_id, effective_at, approved/rejected metadata

**Extended `payroll_items`:**
- `bank_name_snapshot`, `bank_account_number_snapshot`, `bank_account_holder_snapshot`, `bank_account_id_snapshot`
- `company_logo_snapshot`

**Extended `biz_company_profile`:**
- `logo` (file: PNG/JPEG/WebP, max 2MB)

**Migration required:** YES (local only)
```bash
npm run migrate:local-hr-phase34f-refinement
```

---

## 6. Automated Test Results

| Suite | Result |
|-------|--------|
| `test:phase34f-refinement` | **36/36 PASS** |
| `test:phase34d-profile` | **34/34 PASS** |
| `test:phase34e-payslip-documents` | **38/38 PASS** |
| `test:phase34f-hr-policy-privacy` | **53/53 PASS** |

**Total regression:** 161/161 PASS

---

## 7. TypeScript

New refinement files: **0 errors** (project-wide `tsc` may still report pre-existing WIP errors unrelated to this phase).

---

## 8. Security

- Staff cannot set `status=active` directly (PB create rule: pending only)
- HR approve/reject server-side with company scope
- Staff cannot self-approve
- Payslip bank from snapshot fields — not live active account
- Account verification unchanged (password, 30m, session-bound)
- No PIN slip gaji

---

## 9. Bank Account Flow

```
STAFF views masked ACTIVE account
        ↓
[Ajukan perubahan] → status PENDING (max 1)
        ↓
HR /hr/payroll-bank → [Setujui] / [Tolak]
        ↓
APPROVED: old ACTIVE → INACTIVE, pending → ACTIVE
REJECTED: ACTIVE unchanged, request → REJECTED
        ↓
Payroll stamp → bank_*_snapshot on payroll_items (immutable)
```

---

## 10. PDF Changes

- A4 print-friendly layout (serif body, clear sections)
- Entity logo (or letter fallback)
- **REKENING PEMBAYARAN** section from snapshot
- Masked account number in PDF
- STATUS as text (grayscale-safe)

---

## 11. Profile UI/UX

- Tabs preserved: Ringkasan | Pribadi | Dokumen | Keamanan
- **Rekening Payroll** in tab Pribadi (read-only + request form)
- One save button for personal fields
- No PIN UI
- Toast via `ProfileFeedbackToast` (fixed viewport)

---

## 12. Entity Logo

- SSOT: `biz_company_profile.logo`
- Upload: `POST /api/master-data/legal-entities/[id]/logo` (Owner)
- Remove: `DELETE` same route
- Stamped to payslip via `company_logo_snapshot`

---

## 13. Manual UAT Checklist

### A. PROFILE
- [ ] Login staff → `/profile` compact tabs
- [ ] No PIN section
- [ ] Toast visible on save (top-right)
- [ ] Tab Pribadi → Rekening Payroll section

### B. BANK ACCOUNT
- [ ] View masked active account
- [ ] Cannot edit active fields directly
- [ ] Submit change request → pending message
- [ ] HR `/hr/payroll-bank` → approve
- [ ] New account active; old inactive

### C. PAYSLIP
- [ ] Preview with account verification (password)
- [ ] PDF shows bank (masked), logo, professional layout

### D. HISTORICAL
- [ ] Old payslip keeps old bank snapshot after account change

### E. ENTITY LOGO
- [ ] Owner uploads logo on entity
- [ ] New payslip shows logo

---

## 14. Local Setup Commands

```bash
npm run migrate:local-hr-phase34f-refinement
npm run test:phase34f-refinement
npm run test:phase34d-profile
npm run test:phase34e-payslip-documents
npm run test:phase34f-hr-policy-privacy
```

---

**READY FOR LOCAL UAT ONLY** — await Owner approval before staging/production.
