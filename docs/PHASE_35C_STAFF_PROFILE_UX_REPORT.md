# Phase 35C — Staff Workspace + Profile UX Refinement Report

**Status:** LOCAL ONLY — reference implementation for `/dashboard-staff` + `/profile`  
**Date:** 2026-09-01  
**Scope:** Staff workspace + profile presentation only — no other modules migrated

---

## Summary

Phase 35C menyempurnakan `/dashboard-staff` dan `/profile` sebagai **reference implementation** ERP Phase 35: layout proporsional, right rail berbasis data nyata, perbaikan entity logo, dan profile UX yang lebih profesional — tanpa mengubah business logic Phase 34F/34G.

---

## UI Changes

### `/dashboard-staff`

| Area | Change |
|------|--------|
| Layout | Grid 12 kolom — main `lg:col-span-8`, right rail `lg:col-span-4` |
| Header | Entity logo via `EntityBrandMark` (fallback initials, no broken image) |
| Greeting | Dinamis berdasarkan waktu + nama user login |
| Navigation | `WorkspaceNavItem` — compact list rows (bukan card grid berat) |
| Right rail | `StaffWorkspaceRail` — Hari ini, Agenda, Quick actions |
| Max width | `WorkspaceLayout` → `max-w-7xl` |

### `/profile`

| Area | Change |
|------|--------|
| Layout | `max-w-6xl`, grid 8/4 desktop — tabs kiri, preferensi akun kanan |
| Header | Avatar 80px, identity panel lebih jelas |
| Bahasa | Dipindah ke `AccountPreferencesPanel` (desktop: sidebar; mobile: tab Keamanan) |
| Ringkasan | Tambah field nama; grid employment overview |
| Pribadi | `FormSection` terpisah: Data pribadi + Kontak; `ActionBar` untuk simpan |
| Rekening | `StatusBadge` aktif pada rekening payroll |

---

## Global Components Improved

| Component | Change |
|-----------|--------|
| `components/ui/entity-brand-mark.tsx` | **NEW** — logo + initials/building fallback, `onError` handling |
| `components/ui/workspace-header.tsx` | Always shows brand mark (never raw `<img>` without fallback) |
| `components/ui/stat-card.tsx` | **NEW** `WorkspaceNavItem` — compact navigation row |
| `components/layout/workspace-layout.tsx` | Configurable `maxWidth` (default `max-w-7xl`) |
| `components/LanguageSwitcher.tsx` | `variant="erp"` — design tokens |
| `components/profile/AccountPreferencesPanel.tsx` | **NEW** — reusable account preferences card |

---

## Broken Entity Logo — Root Cause & Fix

**Penyebab:** `logo_url` dari Entity Identity SSOT mengarah ke `/api/master-data/legal-entities/{id}/logo`, yang memerlukan capability `master_data.entity.view`. Staff tidak memiliki capability ini → request gagal → browser menampilkan broken image icon.

**Perbaikan:**
1. **NEW** `GET /api/profile/self/entity-logo` — logo primary entity untuk user yang login (scoped, tanpa master-data capability)
2. `GET /api/profile/self/entity-identity` menulis ulang `logo_url` ke endpoint staff-safe
3. `EntityBrandMark` menangani error loading + fallback initials

RBAC master data **tidak dilonggarkan**. Staff hanya melihat logo entitas primary mereka sendiri.

---

## Staff Right Rail — Data Sources

| Panel | Source | Notes |
|-------|--------|-------|
| Hari ini | `GET /api/hr/attendance/today` | Status absensi, jadwal, check-in/out |
| Agenda | `getLeaveHistory()` + `fetchOvertimeForUser()` | Cuti approved/pending & lembur upcoming — max 5 items |
| Quick actions | `filterQuickActionsForUser()` + `canAccess()` | Profil, Cuti, Absensi, Slip Gaji, Lembur |

**Tidak ada data dummy.** Jika tidak ada agenda → `EmptyState`.

---

## Security / Business Logic — NOT Changed

- RBAC (`canAccess`, workspace resolver)
- Account Verification Phase 34F
- Payroll bank workflow Phase 34G
- Profile APIs (GET/PATCH self, avatar, password, documents)
- Document ownership / authorization
- Payroll formula, payslip PDF
- Hash navigation profile (`#ringkasan`, legacy hashes)
- No Payslip PIN UI

---

## Files Changed / Added

### Changed
- `components/workspace/StaffWorkspaceView.tsx`
- `components/workspace/StaffWorkspaceRail.tsx` *(new)*
- `components/EmployeeSelfProfile.tsx`
- `components/profile/PayrollBankAccountSection.tsx`
- `components/ui/workspace-header.tsx`
- `components/ui/stat-card.tsx`
- `components/ui/index.ts`
- `components/layout/workspace-layout.tsx`
- `components/LanguageSwitcher.tsx`
- `app/api/profile/self/entity-identity/route.ts`
- `lib/i18n/messages/design-id.ts`
- `lib/i18n/messages/design-en.ts`
- `package.json`

### Added
- `components/ui/entity-brand-mark.tsx`
- `components/profile/AccountPreferencesPanel.tsx`
- `components/workspace/StaffWorkspaceRail.tsx`
- `app/api/profile/self/entity-logo/route.ts`
- `scripts/test-phase35c-staff-profile-ux.mjs`
- `docs/PHASE_35C_STAFF_PROFILE_UX_REPORT.md`

### Not migrated
`/hr`, `/dashboard-owner`, accounting, warehouse, POS, sales, purchasing

---

## Test Results

| Suite | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:phase35c-staff-profile-ux` | **24/24** |
| `npm run test:phase35b-profile` | **35/35** |
| `npm run test:phase35-design-system` | **52/52** |
| `npm run test:phase34f-hr-policy-privacy` | **53/53** |
| `npm run test:phase34g` | **26/26** |
| `npm run test:phase34f-refinement` | **36/36** |

---

## Known Limitations

1. Agenda rail tidak mencakup aktivitas luar kantor (belum ada API ringkas self-service).
2. Panel "Informasi penting" HR tidak ditampilkan — belum ada sumber data pengumuman yang sesuai scope staff.
3. Label rekening payroll (Aktif, dll.) masih hardcoded ID di `PayrollBankAccountSection` (pre-existing pattern).
4. `ProfileLanguageSettings.tsx` tetap ada untuk kompatibilitas tetapi tidak lagi dipakai di `/profile`.

---

## Manual UAT Checklist

### Staff
- [ ] Login sebagai Staff
- [ ] Buka `/dashboard-staff`
- [ ] Tidak ada menu admin / master data
- [ ] Entity logo tampil atau fallback initials (bukan broken image)
- [ ] Sisi kanan berisi Hari ini + Agenda + Quick actions
- [ ] Data kanan sesuai akun yang login
- [ ] Tidak ada data dummy / placeholder palsu
- [ ] Navigasi compact — klik shortcut berfungsi
- [ ] Responsive: mobile single column, rail di bawah main

### Profile
- [ ] Buka `/profile`
- [ ] Header identity: avatar, nama, email, role, entity
- [ ] Desktop: preferensi bahasa di sidebar kanan
- [ ] Mobile: preferensi bahasa di tab Keamanan
- [ ] Tab Ringkasan / Pribadi / Dokumen / Keamanan
- [ ] Simpan data pribadi → toast
- [ ] Rekening payroll — ajukan perubahan (aktif tidak berubah langsung)
- [ ] Dokumen → Account Verification modal
- [ ] Keamanan → ubah password, tidak ada PIN
- [ ] Ganti ID ↔ EN → label berubah

---

## STOP Confirmation

Phase 35C **selesai** untuk:
- `/dashboard-staff` ✅
- `/profile` ✅

**Tidak** melanjutkan migration modul lain. Tunggu review/UAT sebelum fase berikutnya.
