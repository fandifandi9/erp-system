# Phase 35E — Role-Aware Workspace Shell Report

**Status:** LOCAL ONLY  
**Date:** 2026-09-01  
**Scope:** `/dashboard-staff` workspace concept + sidebar branding only

---

## Summary

Phase 35E memperbaiki dua hal utama:

1. **Konsep "Meja Kerja"** — role-aware, config-driven, permission-filtered (bukan hardcode staff-only)
2. **Sidebar branding** — logo SERBA System tidak lagi terpotong/overlap di sidebar sempit

Semua business logic, API, RBAC engine, dan modul lain **tidak diubah**.

---

## Masalah Logo Sidebar (Phase 35D)

**Root cause:** `AppBrand` menggunakan logo **wide** (`systemLogoWide.png`) dengan aspect ratio ~6.5:1. Pada sidebar 256px, logo horizontal ~181px + teks "SERBA System" tidak muat → teks terpotong menjadi "SE...", overlap, atau simbol terlalu besar.

**Fix:**
- Komponen baru `SidebarBrand` — logo **persegi** (`SYSTEM_LOGO_PATH`) 32×32 + nama penuh tanpa `truncate`
- Sidebar staff diperlebar: `lg:w-72` (288px) vs `lg:w-64` untuk role lain
- Mobile drawer: `min(20rem, 90vw)` untuk staff shell

---

## Konsep "Meja Kerja" — Role-Aware

"Meja Kerja" = **personal workspace** user, bukan sinonim "Staff Dashboard".

Struktur config:

```
WorkspaceConfig
├── commonSections    → Personal, Kehadiran, Penggajian, Informasi Perusahaan
├── roleSections      → Modul spesifik role (Finance, Warehouse, HR, …)
├── quickActions      → Route + icon + accessPath
└── filter via canAccess() + filterSectionsForUser()
```

**Staff (implemented):**
- `commonSections`: Personal, Kehadiran & Pekerjaan, Penggajian, Informasi Perusahaan
- `roleSections: []` — siap diisi saat role workspace lain ditambahkan

**Finance / Warehouse / HR (NOT implemented):**
- Placeholder configs (`owner.ts`, `hr.ts`) updated dengan `commonSections` + `roleSections`
- `getWorkspaceConfigForUser()` resolves config by permission, not hardcoded `if role === "finance"`

### Sidebar vs Main Content

| Area | Personal (Profil) | Other sections |
|------|-------------------|----------------|
| **Sidebar** | Hidden (`STAFF_SIDEBAR_EXCLUDE_SECTIONS`) | Shown |
| **Main workspace** | Shown | Shown |
| **Topbar** | Profile via avatar | — |

Sidebar = navigasi ERP. Main content = meja kerja (sections + right rail).

---

## /dashboard-staff Content (unchanged structure)

```
[Entity logo] PT. Serba Digital Indonesia
Meja Kerja Staff
Kehadiran, pekerjaan, penggajian, dan informasi personal Anda.

Selamat [pagi/siang/sore], {name}.

PERSONAL → Profil
KEHADIRAN & PEKERJAAN → …
PENGGAJIAN → Slip Gaji
INFORMASI PERUSAHAAN → …

Right rail: Hari Ini · Agenda · Aksi Cepat
```

---

## Permission Filtering

- `filterSectionsForUser(config, user)` — merges `commonSections` + `roleSections`, filters by `canAccess(accessPath)`
- `excludeSectionIds` option — sidebar omits `personal`
- **Role ≠ permission** — menu hanya tampil jika user punya akses route

---

## Entity Logo (Phase 35C preserved)

- Staff-safe: `GET /api/profile/self/entity-logo`
- `EntityBrandMark` di workspace header dengan fallback initials + `onError`
- Tidak kembali ke master-data logo endpoint

---

## Files Changed / Added

### Added
- `components/ui/sidebar-brand.tsx`
- `scripts/test-phase35e-role-aware-workspace.mjs`
- `docs/PHASE_35E_ROLE_AWARE_WORKSPACE_SHELL_REPORT.md`

### Changed
- `lib/workspace/types.ts` — `commonSections`, `roleSections`, `mergeWorkspaceSections()`
- `lib/workspace/resolve-workspace.ts` — `getWorkspaceConfigForUser()`, `excludeSectionIds`
- `lib/workspace/workspaces/staff.ts` — refactor to common/role sections
- `lib/workspace/workspaces/owner.ts` — placeholder alignment
- `components/Sidebar.tsx` — `SidebarBrand`, wider staff sidebar
- `components/workspace/StaffSidebarNav.tsx` — exclude personal via constant
- `components/workspace/StaffWorkspaceView.tsx` — `getWorkspaceConfigForUser()`
- `components/ui/workspace-header.tsx` — entity name hierarchy
- `components/ui/index.ts` — export SidebarBrand
- `scripts/test-phase35d-staff-workspace-shell.mjs` — updated assertions
- `package.json`

---

## NOT Changed

- Business logic, HR APIs, payroll, attendance workflows
- RBAC rules / `canAccess()` implementation
- `/hr`, accounting, warehouse, sales, purchasing modules
- Topbar for non-staff roles
- Right rail data sources (real API, no dummy)
- Payslip PDF, Account Verification, payroll bank workflow

---

## Test Results

| Suite | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:phase35e-role-aware-workspace` | **16/16** |
| `npm run test:phase35d-staff-workspace-shell` | **17/17** |
| `npm run test:phase35c-staff-profile-ux` | **24/24** |
| `npm run test:phase35b-profile` | **35/35** |
| `npm run test:phase35-design-system` | **52/52** |

---

## Manual UAT Checklist

- [ ] Login sebagai Staff → `/dashboard-staff`
- [ ] Sidebar: logo persegi + "SERBA System" lengkap (tidak "SE...")
- [ ] Sidebar: Dasbor + 3 group menu
- [ ] Main: entity name, Meja Kerja Staff, greeting, semua sections termasuk Personal
- [ ] Right rail: Hari Ini, Agenda, Aksi Cepat
- [ ] Topbar: tanpa logo SERBA, ada notif + user + avatar
- [ ] Mobile drawer berfungsi
- [ ] HR/Owner sidebar tidak berubah

---

## STOP Confirmation

Phase 35E selesai untuk `/dashboard-staff` shell + workspace concept.

**Tidak** migrate modul lain. Tunggu UAT.
