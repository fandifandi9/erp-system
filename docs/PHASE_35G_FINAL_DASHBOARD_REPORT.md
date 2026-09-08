# Phase 35G — Final Dashboard + Contextual Meja Kerja

**Tanggal:** 1 September 2026  
**Scope:** `/dashboard-staff` presentation + staff sidebar Meja Kerja section  
**Status:** Selesai — menunggu UAT manual

---

## Ringkasan

Phase 35G memisahkan empat konsep yang sebelumnya tercampur:

| Konsep | Peran |
|--------|-------|
| **Dasbor** | Overview — "Apa yang sedang terjadi?" |
| **Sidebar** | Navigasi modul (Kehadiran, Penggajian, Informasi) |
| **Meja Kerja** | Section sidebar untuk modul tambahan permission-based |
| **Profile** | Avatar/topbar saja |

---

## Perubahan Utama

### 1. Dashboard = Overview (bukan daftar modul)

Halaman `/dashboard-staff` tidak lagi menampilkan card navigasi duplikat (Profil, Absensi, Cuti, dll.).

**Konten baru:**
- Header: entity logo + nama perusahaan + judul **Dasbor**
- Greeting + subtitle ringkasan
- **KPI cards:** Status Kehadiran, Pengajuan Aktif, Lembur Bulan Ini, Slip Gaji
- **Ringkasan Kehadiran** (dari `fetchStaffBenefitSummary` / snapshot existing)
- **Tren Kehadiran** (14 hari terakhir dari `/api/hr/attendance/history`)
- **Aktivitas Terbaru** (notifikasi, cuti, lembur, check-in — data real)
- **Shortcut Cepat** (Ajukan Cuti, Lembur, Absensi, Slip Gaji, Laporan — `canAccess()`)
- **Right rail** tetap: Hari Ini, Agenda, Aksi Cepat

### 2. Meja Kerja di sidebar

Sidebar staff sekarang:

```
Dasbor
Kehadiran & Pekerjaan
Penggajian
Informasi Perusahaan
Meja Kerja          ← section baru di bawah
  (kosong + empty state untuk Staff)
```

- `roleSections` = modul Meja Kerja (kosong untuk Staff)
- `filterDeskActionsForUser()` — permission-based, tanpa hardcode role
- Empty state: *"Belum ada modul tambahan untuk peran Anda..."*
- Profile **tidak** masuk Meja Kerja

### 3. Arsitektur workspace

```
filterCommonSectionsForUser()  → sidebar: Kehadiran, Penggajian, Informasi
filterDeskActionsForUser()     → sidebar: Meja Kerja modules
```

Staff config:
- `titleKey`: `workspace.staff.dashboard.title` → **Dasbor**
- `personalSection` dihapus
- `roleSections: []`

---

## Alasan Perubahan

1. **Anti-duplikasi** — modul sudah ada di sidebar; dashboard tidak perlu mengulang navigasi
2. **Dasbor = overview** — KPI, ringkasan, aktivitas, shortcut aksi
3. **Meja Kerja = contextual modules** — terpisah dari common navigation; siap diisi incremental (finance, warehouse, HR)
4. **Permission sebagai sumber kebenaran** — tidak ada `if role === "finance"`

---

## File yang Berubah

| File | Perubahan |
|------|-----------|
| `components/workspace/StaffDashboardOverview.tsx` | **Baru** — overview dashboard |
| `components/workspace/StaffWorkspaceView.tsx` | Overview layout, header Dasbor + entity |
| `components/workspace/StaffSidebarNav.tsx` | Common sections + Meja Kerja section |
| `lib/workspace/resolve-workspace.ts` | `filterCommonSectionsForUser`, `filterDeskActionsForUser` |
| `lib/workspace/workspaces/staff.ts` | Dashboard keys, hapus personalSection, urutan sidebar |
| `lib/i18n/messages/design-id.ts` | Dashboard + Meja Kerja i18n |
| `lib/i18n/messages/design-en.ts` | Dashboard + Meja Kerja i18n |
| `scripts/test-phase35g-final-dashboard.mjs` | **Baru** |
| `scripts/test-phase35c/d/e/f*.mjs` | Update assertions |
| `package.json` | `test:phase35g-final-dashboard` |

**Tidak diubah:** API, database, RBAC, business logic, modul HR/accounting/warehouse.

---

## Hasil Test

| Test | Hasil |
|------|-------|
| `tsc --noEmit` | PASS |
| `test:phase35g-final-dashboard` | 25/25 PASS |
| `test:phase35f-meja-kerja` | 9/9 PASS |
| `test:phase35e-role-aware-workspace` | 21/21 PASS |
| `test:phase35d-staff-workspace-shell` | 20/20 PASS |
| `test:phase35c-staff-profile-ux` | 25/25 PASS |
| `test:phase35b-profile` | 35/35 PASS |
| `test:phase35-design-system` | 52/52 PASS |

**Total:** 187 assertions, 0 regression.

---

## UAT Checklist

| # | Cek | Expected |
|---|-----|----------|
| 1 | Buka `/dashboard-staff` | Judul **Dasbor** (bukan Meja Kerja) |
| 2 | Header | Logo + **PT. Serba Digital Indonesia** jelas |
| 3 | Main content | KPI, ringkasan, tren, aktivitas, shortcut — **bukan** daftar modul |
| 4 | Sidebar | Dasbor, Kehadiran, Penggajian, Informasi, **Meja Kerja** |
| 5 | Meja Kerja (Staff) | Empty state sederhana |
| 6 | Profile | Hanya di topbar avatar |
| 7 | Right rail | Hari Ini, Agenda, Aksi Cepat |
| 8 | Tidak ada card duplikat Absensi/Cuti/Slip Gaji sebagai navigasi |

---

## STOP

Phase 35G selesai. Tidak ada migrasi modul lain. Menunggu UAT manual.
