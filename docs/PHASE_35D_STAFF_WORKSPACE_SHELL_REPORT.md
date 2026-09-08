# Phase 35D — Staff Workspace Shell Refinement Report

**Status:** LOCAL ONLY  
**Date:** 2026-09-01  
**Scope:** `/dashboard-staff` workspace shell (sidebar + topbar) only

---

## Summary

Phase 35D menyempurnakan **ERP workspace shell** untuk staff POV: sidebar terstruktur penuh, branding SERBA System dipindah ke sidebar header, topbar disederhanakan. Konten Phase 35C (main 8/12 + right rail 4/12) **tidak diubah**.

---

## Changes

### A. Sidebar — structured staff navigation

Untuk user dengan `getOperationalDashboardRoute() === '/dashboard-staff'`:

| Group | Items |
|-------|-------|
| *(top)* | **Dasbor** → `/dashboard-staff` |
| **Kehadiran & Pekerjaan** | Laporan & Temuan, Absensi, Cuti, Lembur, Aktivitas Luar Kantor |
| **Penggajian** | Slip Gaji |
| **Informasi Perusahaan** | Aturan & Informasi HR, Kalender & Hari Libur |

- Routes dari `staffWorkspaceConfig` (existing)
- `filterSectionsForUser()` + `canAccess()` — menu tanpa permission tidak tampil
- Profil **tidak** di sidebar (akses via topbar avatar)
- Mobile drawer existing tetap dipakai (`lg` breakpoint)

### B. Brand / logo

- **Sidebar header:** `AppBrand` (logo + "SERBA System") di atas navigasi
- **Sidebar footer:** `SERBA System v3.0` (existing)
- **Topbar:** logo disembunyikan untuk staff shell — hanya hamburger (mobile), notifikasi, nama, role, avatar

### C. Content (unchanged)

- `StaffWorkspaceView` — greeting, `WorkspaceNavItem` groups, `StaffWorkspaceRail`
- Layout `max-w-7xl`, grid 8/4

---

## Files

### Added
- `components/workspace/StaffSidebarNav.tsx`
- `scripts/test-phase35d-staff-workspace-shell.mjs`
- `docs/PHASE_35D_STAFF_WORKSPACE_SHELL_REPORT.md`

### Changed
- `components/Sidebar.tsx` — staff shell branch + brand header
- `components/Navbar.tsx` — hide `AppBrand` for staff shell
- `lib/workspace/workspaces/staff.ts` — `staffSidebarSections`
- `lib/i18n/messages/design-id.ts` — `workspace.staff.sidebar.dashboard`
- `lib/i18n/messages/design-en.ts`
- `package.json`

---

## Business Logic — NOT Changed

- RBAC / `canAccess()`
- APIs, attendance, payroll, leave workflows
- Database schema
- HR / accounting / warehouse modules

---

## Test Results

| Suite | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:phase35d-staff-workspace-shell` | **17/17** |
| `npm run test:phase35-design-system` | **52/52** |
| `npm run test:phase35b-profile` | **35/35** |
| `npm run test:phase35c-staff-profile-ux` | **24/24** |

---

## Manual UAT Checklist

- [ ] Login sebagai Staff
- [ ] Sidebar menampilkan brand SERBA System di atas
- [ ] Dasbor + 3 group menu lengkap
- [ ] Menu tanpa permission tidak muncul
- [ ] Active state jelas per halaman
- [ ] Topbar tanpa logo besar — hanya notif + user + avatar
- [ ] Mobile: sidebar drawer, tidak memakan content
- [ ] Main content + right rail masih ada
- [ ] HR/Owner sidebar tidak berubah

---

## STOP Confirmation

Hanya `/dashboard-staff` shell yang disempurnakan. Modul lain **tidak** dimigrate.
