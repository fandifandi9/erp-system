# Phase 35H — Staff + Role Additional Access + Meja Kerja + Full Module Entry

**Status:** Complete (navigation/UX only — awaiting UAT)  
**Date:** 2026-09-01

---

## 1. Konsep Arsitektur

Phase 35H mengunci empat konsep terpisah:

| Konsep | Route / Lokasi | Peran |
|--------|----------------|-------|
| **A. Dasbor** | `/dashboard-staff` | Overview pribadi karyawan (KPI, kehadiran, pengajuan, slip gaji, tren, aktivitas, shortcut, right rail) |
| **B. Sidebar Modul Karyawan** | Staff sidebar | Dasbor, Kehadiran & Pekerjaan, Penggajian, Informasi Perusahaan, **Meja Kerja** |
| **C. Meja Kerja** | Sidebar section | Compact contextual workbench — pekerjaan tambahan sesuai permission |
| **D. Full Module Workspace** | `/hr`, `/keuangan`, `/gudang`, … | Workspace penuh modul; diakses via **Buka …** di tab browser baru |

Alur permission:

```
USER → PERMISSIONS (canAccess) → MEJA KERJA ITEMS → FULL MODULE ENTRY
```

Satu user Staff boleh memiliki beberapa modul tambahan (HR + Finance + Warehouse) tanpa mengubah identitas utama sebagai karyawan.

---

## 2. Perubahan File

| File | Perubahan |
|------|-----------|
| `lib/workspace/desk-modules.ts` | **Baru** — definisi modul Meja Kerja (HR, Finance, Warehouse) + contextual items + full module paths |
| `lib/workspace/resolve-workspace.ts` | Tambah `resolveDeskModulesForUser()`; `filterDeskActionsForUser()` ditandai deprecated |
| `components/workspace/StaffDeskWorkbench.tsx` | **Baru** — render Meja Kerja: grup modul, item kontekstual (same tab), tombol Buka … (new tab) |
| `components/workspace/StaffSidebarNav.tsx` | Meja Kerja memakai `StaffDeskWorkbench` + `resolveDeskModulesForUser` |
| `lib/i18n/messages/design-id.ts` | Label Meja Kerja: modul, item kontekstual, Buka HR/Finance/Warehouse |
| `lib/i18n/messages/design-en.ts` | Terjemahan EN untuk key yang sama |
| `scripts/test-phase35h-staff-role-module-entry.mjs` | **Baru** — test Phase 35H |
| `scripts/test-phase35g-final-dashboard.mjs` | Diperbarui — assert resolver/workbench baru |
| `package.json` | Script `test:phase35h-staff-role-module-entry` |

---

## 3. Permission Model

- **Sumber kebenaran:** `canAccess(user, accessPath)` dari `lib/rbac.ts` (+ inventory paths untuk gudang).
- **Tidak ada** branching `role === "hr"` / `"finance"` / `"warehouse"`.
- Setiap **modul Meja Kerja** muncul jika `canAccess(user, fullModuleAccessPath)`.
- Setiap **item kontekstual** muncul jika `canAccess(user, item.accessPath)`.
- **Full module route** tetap divalidasi server-side oleh RBAC existing; UI hanya menampilkan entry jika permission ada.

### Modul & item kontekstual

**HR** (`/hr`)
- Review Cuti → `/hr/leave`
- Review Absensi → `/hr/attendance/suspicious`
- Temuan HR → `/hr/findings`
- Kelola Karyawan → `/hr/employees`

**Finance** (`/keuangan`)
- Invoice → `/keuangan/piutang`
- Pembayaran → `/keuangan/kas-bank`
- Rekonsiliasi → `/keuangan/rekonsiliasi`

**Warehouse** (`/gudang`)
- Stock Opname → `/gudang/opname`
- Transfer Gudang → `/gudang/transfer`
- Barang Masuk → `/gudang/penerimaan`
- Picking → `/gudang/picking`

---

## 4. Meja Kerja Behavior

- Staff **tanpa** permission modul tambahan → empty state: *"Belum ada modul tambahan untuk peran Anda…"*
- Staff + permission → grup modul (HR / FINANCE / WAREHOUSE) dengan item ringkas + tombol full module.
- **Bukan** daftar lengkap sidebar HR/Finance/Warehouse.
- **Tidak** dummy module — hanya route yang ada di konfigurasi + permission.
- Deskripsi item statis (tanpa angka dummy); data dinamis dapat ditambahkan di fase berikutnya jika API count tersedia.

---

## 5. Full Module Entry Behavior

- Label: **Buka HR**, **Buka Finance**, **Buka Warehouse** (bukan Masuk/Go/Open).
- Icon `ExternalLink` (↗) sebagai indikasi tab baru.
- Implementasi:

```html
<a href="/hr" target="_blank" rel="noopener noreferrer">Buka HR ↗</a>
```

- `/hr`, `/keuangan`, `/gudang` tetap full workspace — tidak disederhanakan.

---

## 6. New-Tab Behavior

| Navigasi | Tab |
|----------|-----|
| Dasbor, Absensi, Cuti, Lembur, Slip Gaji, item kontekstual Meja Kerja | **Same tab** (`<Link>`) |
| Buka HR / Buka Finance / Buka Warehouse | **New browser tab** (`target="_blank"`) |

- Tab `/dashboard-staff` tidak digantikan.
- Tidak memakai `window.location.href` atau `window.open`.
- Session/auth existing tetap berlaku di tab baru.

---

## 7. Mobile Behavior

- Meja Kerja di sidebar accordion tetap compact: grup modul, item vertikal, tombol full module full-width.
- Tidak dibuat “mobile HR” terpisah; full module tetap workspace penuh di tab baru.

---

## 8. Test Results

| `npm run tsc --noEmit` (`npx tsc --noEmit`) | PASS |
| `test:phase35-design-system` | 52/52 PASS |
| `test:phase35b-profile` | 35/35 PASS |
| `test:phase35c-staff-profile-ux` | 25/25 PASS |
| `test:phase35d-staff-workspace-shell` | 20/20 PASS |
| `test:phase35e-role-aware-workspace` | 21/21 PASS |
| `test:phase35f-meja-kerja` | 8/8 PASS |
| `test:phase35g-final-dashboard` | 28/28 PASS |
| `test:phase35h-staff-role-module-entry` | 42/42 PASS |

---

## 9. Acceptance Criteria Mapping

| AC | Status |
|----|--------|
| AC1 Dasbor pribadi di `/dashboard-staff` | ✅ |
| AC2 Sidebar struktur (Dasbor, Kehadiran, Penggajian, Info, Meja Kerja) | ✅ |
| AC3 Empty state staff biasa | ✅ |
| AC4–AC6 HR / Finance / Warehouse contextual items | ✅ |
| AC7 Meja Kerja ringkas, bukan full menu | ✅ |
| AC8 Full module via Buka … | ✅ |
| AC9–AC10 New tab + dashboard tab tetap | ✅ |
| AC11 Session existing | ✅ |
| AC12–AC13 Internal same-tab; full entry new-tab | ✅ |
| AC14–AC15 No hardcoded role; canAccess source of truth | ✅ |
| AC16 Mobile compact | ✅ |

---

## 10. File yang Tidak Disentuh

- Database / PocketBase schema
- API routes & business logic (HR, Finance, Warehouse, Payroll, Accounting)
- RBAC core (`lib/rbac.ts` logic unchanged)
- Halaman full module: `/hr`, `/keuangan`, `/gudang`, modul operasional lainnya
- `StaffDashboardOverview`, charts, right rail (Phase 35G)
- Navbar entity branding (Phase 35G)

---

**STOP — Phase 35H selesai. Menunggu UAT.**
