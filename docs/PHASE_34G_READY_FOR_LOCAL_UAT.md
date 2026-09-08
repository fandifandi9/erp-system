# PHASE 34G — READY FOR LOCAL UAT

**Scope:** LOCAL ONLY — no staging, production, APK, or deployment.

**Status:** READY FOR LOCAL UAT

**Prerequisite:** Phase 34F must remain intact (Account Verification, no PIN Slip Gaji).

---

## 1. Summary

Phase 34G adds two foundations on top of 34F:

1. **Entity Identity SSOT** — `biz_company_profile` is the single source for logo, legal/display name, contact, NPWP, and address. Editable via **Pengaturan → Identitas Entitas** (Owner edit, HR read-only). Consumed by payslip PDF, attendance, and HR documents.
2. **Effective-dated payroll bank accounts** — Staff submit change requests (`PENDING_APPROVAL`); HR/Finance approve or reject with mandatory reject reason. Accounts are effective-dated (`effective_from` / `effective_until`). Payslip uses immutable bank + entity snapshots at lock/issue time — historical slips never change when staff updates bank details.

Phase 34F security is preserved: payslip and sensitive documents still require Account Verification (login password, 30-minute session grant, cleared on logout). No PIN was added.

---

## 2. Architecture

```
biz_company_profile (Entity Identity SSOT)
  ├── logo, legal_name, display_name, address, phone, email, website, npwp
  └── read via getEntityIdentityForUser / getEntityIdentityById (entity-scoped)

hr_payroll_bank_accounts
  ├── active | pending | inactive | rejected
  ├── effective_from / effective_until (period-aware resolution)
  └── approval workflow → assertPayrollBankApprover (payroll.bank.approve)

payroll_items (immutable snapshots at lock)
  ├── company_*_snapshot (incl. logo, legal_name)
  └── bank_*_snapshot (name, number, holder)

Staff flow: Profile → Pribadi → REKENING BANK → Ajukan perubahan
HR flow:    Pengaturan → Persetujuan Rekening → Review → Approve/Reject
```

---

## 3. Database Changes

**Migration script:** `scripts/migrate-local-hr-phase34g.mjs`

| Collection / Table | Change |
|--------------------|--------|
| `hr_payroll_bank_accounts` | Added `effective_from`, `effective_until`, `created_by`, `updated_by`; backfill `effective_from` from `effective_at` |
| `biz_company_profile` | Added `display_name`, `updated_by` |
| `payroll_items` | Added `company_legal_name_snapshot` |

**Migration required:** YES (local)

```bash
npm run migrate:local-hr-phase34g
```

**Already run locally:** Yes (schema OK on dev machine).

---

## 4. API Changes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/profile/self/entity-identity` | GET | Staff entity branding (logo + display name) |
| `/api/master-data/legal-entities/[id]/identity` | GET | Entity identity (entity-scoped) |
| `/api/master-data/legal-entities/[id]` | PATCH | Update identity fields (+ `display_name`) |
| `/api/master-data/legal-entities/[id]/logo` | GET/POST | Logo proxy / upload (existing, reused) |
| `/api/profile/self/payroll-bank` | GET/POST | Self bank view + change request |
| `/api/hr/payroll-bank-requests` | GET | Pending requests (HR approver) |
| `/api/hr/payroll-bank-requests/[id]/approve` | POST | Approve with `effective_from` |
| `/api/hr/payroll-bank-requests/[id]/reject` | POST | Reject (reason required) |

All endpoints: auth required, entity-scoped, staff ownership enforced server-side.

---

## 5. UI Changes

| Location | Change |
|----------|--------|
| `/pengaturan/identitas-entitas` | New Entity Identity editor (logo preview/upload, single Simpan, toast) |
| `/pengaturan/entitas-administratif` | Link to Identitas Entitas |
| `/pengaturan/persetujuan-rekening` | HR bank approval table + Review modal (approve/reject, effective date) |
| `/profile` → tab **Pribadi** | REKENING BANK section (picker, masked number, pending/rejected states) |
| Payslip PDF | Entity logo + legal name; **Informasi Pembayaran** from snapshot |
| `/hr/attendance` (desktop) | Entity logo + display name header from SSOT |
| Nav | Identitas Entitas under Pengaturan (HR + Owner) |

`/hr/payroll-bank` redirects to `/pengaturan/persetujuan-rekening` (per prior navigation decision).

---

## 6. Security Changes

- Bank account numbers masked in UI (`•••• 1234`).
- Staff can only read/submit own bank data; `employee_id` from client is ignored.
- HR approval gated by `payroll.bank.approve` capability (Owner bypass).
- Entity identity reads use `assertLegalEntityReadableByActor` — Entity A cannot read Entity B.
- Account Verification (34F) unchanged for payslip and sensitive document access.
- Logout clears verification grant (34F regression verified).

---

## 7. Payroll Snapshot Behavior

1. On payroll lock/finalize, `resolvePayrollBankSnapshotForPeriod` resolves bank account **as of payroll period date** (`pay_date` / `end_date`), not current active account.
2. Fields stamped on `payroll_items`: `bank_name_snapshot`, `bank_account_number_snapshot`, `bank_account_holder_snapshot`.
3. Existing snapshots are never overwritten (immutable).
4. Payslip PDF reads snapshots only — not live profile bank fields.
5. Example: Account A until 2026-08-31, Account B from 2026-09-01 → August payroll uses A, September uses B.

---

## 8. Entity Identity Behavior

- SSOT: `biz_company_profile` (no per-module logo upload).
- Logo stored via existing file storage on legal entity record.
- Payslip: `company_logo_snapshot`, `company_legal_name_snapshot`, `company_name_snapshot` at lock; PDF falls back to live entity logo only when snapshot empty (legacy rows).
- Attendance: fetches `/api/profile/self/entity-identity` for header branding.
- Owner edits at Identitas Entitas; HR sees read-only form.

---

## 9. Automated Test Results

| Suite | Command | Result |
|-------|---------|--------|
| Phase 34G | `npm run test:phase34g` | **26 passed, 0 failed** |
| Phase 34D | `npm run test:phase34d-profile` | **34 passed, 0 failed** |
| Phase 34E | `npm run test:phase34e-payslip-documents` | **38 passed, 0 failed** |
| Phase 34F policy | `npm run test:phase34f-hr-policy-privacy` | **53 passed, 0 failed** |
| Phase 34F refinement | `npm run test:phase34f-refinement` | **36 passed, 0 failed** |

---

## 10. TypeScript Result

```bash
npx tsc --noEmit
```

**Result:** PASS (exit 0)

---

## 11. Manual UAT Checklist

### A. STAFF PROFILE
- [ ] Login as staff (e.g. `fn2@gmail.com`)
- [ ] Buka `/profile` → tab **Pribadi**
- [ ] Lihat rekening aktif (masked)
- [ ] Ajukan perubahan rekening (bank, nomor, nama pemilik)
- [ ] Status pending muncul dengan detail masked

### B. APPROVAL
- [ ] Login HR/Finance dengan `payroll.bank.approve`
- [ ] Buka `/pengaturan/persetujuan-rekening`
- [ ] Review pengajuan → Approve dengan `effective_from`
- [ ] Staff menerima notifikasi; status berubah

### C. EFFECTIVE DATE
- [ ] Rekening lama `effective_until` = hari sebelum `effective_from` baru
- [ ] Payroll periode sebelum `effective_from` tetap pakai rekening lama (snapshot)
- [ ] Payroll periode setelah `effective_from` pakai rekening baru

### D. PAYSLIP
- [ ] Buka slip gaji → Account Verification (password login)
- [ ] Logo entity tampil
- [ ] Section **Informasi Pembayaran** dengan bank masked
- [ ] Ganti rekening aktif → slip lama tidak berubah

### E. ENTITY
- [ ] Owner: `/pengaturan/identitas-entitas` → ganti logo + simpan
- [ ] Verifikasi logo di payslip baru dan absensi
- [ ] Entity lain tidak terpengaruh

### F. SECURITY
- [ ] Logout → login → payslip minta verifikasi lagi (grant expired/cleared)
- [ ] Staff tidak bisa lihat rekening staff lain via API/UI
- [ ] Tidak ada PIN Slip Gaji di profile atau payslip

### G. REJECT FLOW
- [ ] HR reject dengan alasan wajib
- [ ] Staff lihat status ditolak + alasan
- [ ] Rekening aktif lama tetap dipakai

---

## 12. Known Limitations

1. **Bank master list** — Static Indonesian bank picker (`PAYROLL_BANK_OPTIONS`); no separate `banks` master table yet.
2. **HR nav placement** — Approval menu under **Pengaturan** (not HR → Payroll submenu); `/hr/payroll-bank` redirects.
3. **Static tests** — `test:phase34g` validates architecture/artifacts; full API integration tests require running PocketBase + seeded users.
4. **Legacy payroll rows** — Pre-34G slips without snapshots may show entity logo fallback from live SSOT; bank section empty if never stamped.
5. **Rate-limit fields** — Account verification still reuses legacy PB field names (`payslip_pin_failed_attempts`) internally; no PIN UX.

---

## 13. Migration Required / Not Required

| Environment | Required? | Command |
|-------------|-----------|---------|
| Local dev | **YES** (once) | `npm run migrate:local-hr-phase34g` |
| Staging | **NOT APPLIED** | Do not run until Owner approves |
| Production | **NOT APPLIED** | Do not run until Owner approves |

---

## Key Files (34G)

| File | Purpose |
|------|---------|
| `lib/hr/entity-identity-server.ts` | Entity Identity SSOT reads |
| `lib/hr/entity-identity-types.ts` | `EntityIdentityView` type |
| `lib/hr/payroll-bank-dates.ts` | Effective date helpers |
| `lib/hr/payroll-bank-auth.ts` | Approver authorization |
| `lib/hr/payroll-bank-options.ts` | Bank picker list |
| `lib/hr/payroll-bank-snapshot.ts` | Period-aware bank snapshot |
| `lib/hr/payroll-entity-snapshot.ts` | Entity snapshot (+ legal name) |
| `lib/hr/payroll-slip-pdf.ts` | Informasi Pembayaran + entity header |
| `app/(dashboard)/pengaturan/identitas-entitas/page.tsx` | Entity Identity UI |
| `components/hr/PayrollBankApprovalPanel.tsx` | HR approval UI |
| `components/profile/PayrollBankAccountSection.tsx` | Staff bank UI |
| `components/hr/DesktopAttendancePanel.tsx` | Entity branding header |
| `scripts/migrate-local-hr-phase34g.mjs` | Schema migration |
| `scripts/test-phase34g.mjs` | Automated static tests |

---

*Generated for local UAT — do not deploy to staging/production without Owner sign-off.*
