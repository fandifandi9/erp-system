# Phase 35B — Profile Workspace Migration Report

**Status:** LOCAL ONLY — `/profile` UI/UX pilot  
**Date:** 2026-09-01  
**Scope:** `/profile` only — no other modules migrated

---

## Summary

Halaman `/profile` dimigrasikan ke **Global ERP Design System (Phase 35)** sebagai pilot UI/UX kedua setelah `/dashboard-staff`. Semua business logic Phase 34F (Account Verification), Phase 34G (payroll bank workflow), RBAC, API, dan validasi **dipertahankan tanpa perubahan**.

---

## Files Changed

| File | Change |
|------|--------|
| `components/EmployeeSelfProfile.tsx` | Visual layer → PageShell, Card, Tabs, FormSection, global Button/Input/Textarea, useToast |
| `components/profile/PayrollBankAccountSection.tsx` | Restyle dengan Card, Alert, Button, FormField, Select, Input |
| `components/profile/EmployeePrivateDocumentsSection.tsx` | Restyle dengan Card, StatusBadge, Button, Alert, LoadingState |
| `app/profile/page.tsx` | `ToastProvider`, `bg-erp-bg` |
| `lib/i18n/messages/design-id.ts` | Tab + profile action keys (ID) |
| `lib/i18n/messages/design-en.ts` | Tab + profile action keys (EN) |
| `scripts/test-phase34f-hr-policy-privacy.mjs` | Assert `useToast` (bukan ProfileFeedbackToast) |
| `scripts/test-phase34f-refinement.mjs` | Assert i18n save key |
| `package.json` | `test:phase35b-profile` script |

## Files Added

| File | Purpose |
|------|---------|
| `scripts/test-phase35b-profile.mjs` | Static checks Phase 35B migration |
| `docs/PHASE_35B_PROFILE_MIGRATION_REPORT.md` | This report |

## Files Removed

None.

---

## Business Logic Preserved

| Area | Status |
|------|--------|
| RBAC (`canAccess` on `/profile`) | ✅ Unchanged |
| GET/PATCH `/api/profile/self` | ✅ Unchanged |
| Avatar upload/delete API | ✅ Unchanged |
| Account Verification Phase 34F | ✅ `AccountVerificationModal` + server gate unchanged |
| Document preview/download authorization | ✅ Unchanged |
| Payroll bank Phase 34G workflow | ✅ Request-only; no direct active account edit |
| Change password API | ✅ Unchanged |
| Hash navigation `#ringkasan` `#pribadi` `#dokumen` `#keamanan` | ✅ Preserved |
| Legacy hashes `#dokumen-pribadi` → Dokumen, `#keamanan-slip-gaji` → Keamanan | ✅ Preserved |
| No Payslip PIN UI | ✅ Confirmed |
| Payroll formula / payslip PDF | ✅ Not touched |

---

## UI Changes

### Profile header
- Compact `Card` with avatar (upload/delete when supported), name, email, role, entity
- Fallback avatar via existing `UserAvatar`
- Neutral ERP surface tokens

### Tabs
- Global `Tabs` / `TabPanel` with horizontal scroll on mobile
- Labels via i18n (`profile.tabs.*`)

### Ringkasan
- Employment summary grid with neutral `SummaryField` cells
- `SectionHeader` for section title

### Pribadi
- `FormSection` for contact/biodata fields
- Single primary save: `hr.profile.self.saveProfile`
- `PayrollBankAccountSection` embedded below (Phase 34G workflow UI)

### Dokumen
- Document grid with `Card` per document type
- `StatusBadge` for verification status
- Preview / Download / Upload actions unchanged
- Account verification modal on protected access

### Keamanan
- Read-only email
- Password change form (separate primary action)
- No PIN / payslip unlock UI

### Feedback
- `ProfileFeedbackToast` replaced by global `useToast` + `ToastProvider` on `/profile`

---

## Test Results

| Suite | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:phase35b-profile` | **35/35 PASS** |
| `npm run test:phase35-design-system` | **52/52 PASS** |
| `npm run test:phase34f-hr-policy-privacy` | **53/53 PASS** |
| `npm run test:phase34g` | **26/26 PASS** |
| `npm run test:phase34f-refinement` | **36/36 PASS** |

---

## Known Limitations

1. Payroll bank section labels remain Indonesian hardcoded (pre-existing); not in scope for new i18n keys this increment.
2. Document section labels (KTP, NPWP, etc.) remain Indonesian hardcoded (pre-existing).
3. `/profile` uses `StandaloneAppHeader` (standalone route) — not inside dashboard `WorkspaceLayout`; intentional for canonical profile URL.
4. Avatar delete confirmation still uses `window.confirm` (pre-existing behavior).

---

## Manual UAT Checklist

- [ ] 1. Login sebagai staff
- [ ] 2. Buka `/profile`
- [ ] 3. Cek header profile (avatar, nama, email, role, entity)
- [ ] 4. Cek tab Ringkasan — data kepegawaian
- [ ] 5. Cek tab Pribadi — form data pribadi
- [ ] 6. Edit data pribadi
- [ ] 7. Save
- [ ] 8. Pastikan toast muncul
- [ ] 9. Cek rekening payroll (masked, status)
- [ ] 10. Ajukan perubahan rekening
- [ ] 11. Pastikan rekening aktif tidak berubah langsung
- [ ] 12. Cek tab Dokumen
- [ ] 13. Preview dokumen
- [ ] 14. Pastikan Account Verification modal muncul
- [ ] 15. Verifikasi password
- [ ] 16. Pastikan akses diberikan
- [ ] 17. Cek tab Keamanan
- [ ] 18. Pastikan tidak ada PIN
- [ ] 19. Ganti ID → EN — label tab berubah
- [ ] 20. Test mobile/responsive (tab scroll, single-column form)

---

## Feature Checklist (Post-Migration)

- [x] Ringkasan
- [x] Data pribadi
- [x] Save profile
- [x] Validation (server-side preserved)
- [x] Dokumen pribadi
- [x] Preview dokumen
- [x] Download dokumen
- [x] Account Verification
- [x] Rekening payroll
- [x] Pengajuan perubahan rekening
- [x] Security / change password
- [x] Toast (global Phase 35)
- [x] i18n (tabs + new keys)
- [x] RBAC

---

## Confirmation

**Migration scope: `/profile` ONLY.**

NOT migrated: `/hr`, `/dashboard-owner`, accounting, warehouse, POS, sales, purchasing, payroll page, payslip PDF.

**STOP** — tunggu review/UAT sebelum modul berikutnya.
