# Phase 35F — Meja Kerja Concept + Role-Aware Workspace (Finalization)

**Tanggal:** 1 September 2026  
**Scope:** `/dashboard-staff` + shared workspace shell/configuration  
**Status:** Selesai — menunggu UAT manual

---

## Ringkasan

Phase 35F menyempurnakan konsep **"Meja Kerja"** sebagai workspace pengguna secara umum (bukan "Meja Kerja Staff/Finance/Warehouse"). Arsitektur permission-based dari Phase 35E dipertahankan dan diperjelas dengan pemisahan `personalSection` dari `commonSections`.

---

## Perubahan

### 1. Judul workspace role-neutral

| Sebelum | Sesudah |
|---------|---------|
| `Meja Kerja Staf` / `Staff Workspace` | `Meja Kerja` / `Workspace` |

- Kunci i18n baru: `workspace.desk.title`, `workspace.desk.subtitle`
- `staffWorkspaceConfig` memakai kunci desk, bukan `workspace.staff.title`
- Header menampilkan: **{Entity Name}** → **Meja Kerja** → subtitle umum

### 2. Arsitektur section diperjelas

```
WorkspaceConfig
├── personalSection?     → main workspace only (Profile)
├── commonSections       → Kehadiran, Penggajian, Informasi Perusahaan
├── roleSections?        → modul tambahan per permission (kosong untuk Staff)
└── quickActions         → resolved via canAccess(accessPath)
```

**Fungsi resolusi:**

| Fungsi | Digunakan di | Isi |
|--------|--------------|-----|
| `filterSectionsForUser()` | Sidebar | `commonSections` + `roleSections` |
| `filterMainWorkspaceSectionsForUser()` | Main content | `personalSection` + common + role |

Tidak ada branching `if role === "finance"` — hanya `canAccess()` pada setiap `accessPath`.

### 3. Staff workspace config

**`personalSection`** (main only):
- Personal / Profile → `/profile`

**`commonSections`** (sidebar + main):
- Kehadiran & Pekerjaan — Laporan, Absensi, Cuti, Lembur, Aktivitas Luar Kantor
- Penggajian — Slip Gaji
- Informasi Perusahaan — Aturan HR, Kalender & Hari Libur

**`roleSections`:** `[]` — tidak ada modul dummy.

### 4. Sidebar

- Tetap `SidebarBrand` (logo persegi 32×32 + "SERBA System" penuh)
- Lebar `lg:w-72` (Phase 35E)
- Profile **tidak** ada di sidebar (via `personalSection`, bukan exclude hack)
- Struktur: Dasbor → 3 section grup

### 5. Main content

- Greeting: Selamat pagi/siang/malam, {name}
- Sections: Personal + Kehadiran + Penggajian + Informasi Perusahaan
- Right rail: Hari Ini, Agenda, Aksi Cepat (tidak diubah)

---

## Alasan Perubahan

1. **Satu nama workspace** — "Meja Kerja" mencerminkan halaman kerja pengguna, bukan label role.
2. **Pemisahan personal vs common** — Profile bukan modul navigasi sidebar; tetap tampil sebagai card di main workspace.
3. **Siap untuk role-specific modules** — `roleSections` dapat diisi incremental (finance, warehouse, HR) tanpa mengubah struktur Staff.
4. **Permission sebagai sumber kebenaran** — user dengan kombinasi akses dapat melihat modul yang relevan tanpa bergantung pada satu role string.

---

## Struktur commonSections (Staff)

```typescript
commonSections: [
  { id: "attendance", actionIds: ["reports", "attendance", "leave", "overtime", "field-activity"] },
  { id: "payroll", actionIds: ["payroll"] },
  { id: "company", actionIds: ["policies", "holidays"] },
]
```

## Struktur roleSections (Staff)

```typescript
roleSections: []  // kosong — tidak ada modul finance/warehouse/HR dummy
```

## Permission-based resolution

```typescript
filterQuickActionsForUser(config, user)
  → quickActions.filter(a => canAccess(user, a.accessPath))

filterSectionsForUser(config, user)
  → mergeWorkspaceSections(config)  // common + role
  → filter actions by allowed quick action ids

filterMainWorkspaceSectionsForUser(config, user)
  → personalSection (if allowed) + filterSectionsForUser()
```

---

## File yang diubah

| File | Perubahan |
|------|-----------|
| `lib/workspace/types.ts` | `personalSection`, dokumentasi konsep |
| `lib/workspace/resolve-workspace.ts` | `filterMainWorkspaceSectionsForUser()`, `resolveSectionActions()` |
| `lib/workspace/workspaces/staff.ts` | desk title keys, `personalSection`, common tanpa personal |
| `lib/i18n/messages/design-id.ts` | `workspace.desk.*`, update `workspace.staff.*` |
| `lib/i18n/messages/design-en.ts` | `workspace.desk.*`, update `workspace.staff.*` |
| `components/workspace/StaffWorkspaceView.tsx` | `filterMainWorkspaceSectionsForUser` |
| `components/workspace/StaffSidebarNav.tsx` | hapus `STAFF_SIDEBAR_EXCLUDE_SECTIONS` |
| `scripts/test-phase35d-*.mjs` | assert `personalSection` |
| `scripts/test-phase35e-*.mjs` | assert desk title + main resolver |
| `scripts/test-phase35f-meja-kerja.mjs` | test baru Phase 35F |
| `package.json` | `test:phase35f-meja-kerja` |

**Tidak diubah:** API, database, RBAC implementation, modul HR/accounting/warehouse, business logic attendance/payroll/leave.

---

## UAT Checklist

| # | Cek | Expected |
|---|-----|----------|
| 1 | Buka `/dashboard-staff` | Header: **Meja Kerja** (bukan Meja Kerja Staff) |
| 2 | Logo sidebar | Terlihat jelas, "SERBA System" penuh, tidak "SE..." |
| 3 | Sidebar | Dasbor, Kehadiran & Pekerjaan, Penggajian, Informasi Perusahaan |
| 4 | Main content | Personal, Kehadiran, Penggajian, Informasi Perusahaan |
| 5 | Right rail | Hari Ini, Agenda, Aksi Cepat |
| 6 | Staff | Tidak ada modul role-specific dummy |
| 7 | Greeting | Selamat pagi/siang/sore, {name} |

---

## Hasil Test

| Test | Hasil |
|------|-------|
| `tsc --noEmit` | PASS |
| `test:phase35f-meja-kerja` | 21/21 PASS |
| `test:phase35e-role-aware-workspace` | 20/20 PASS |
| `test:phase35d-staff-workspace-shell` | 18/18 PASS |
| `test:phase35c-staff-profile-ux` | 24/24 PASS |
| `test:phase35b-profile` | 35/35 PASS |
| `test:phase35-design-system` | 52/52 PASS |

**Total:** 170 assertions, 0 regression.

---

## STOP

Phase 35F selesai. Tidak ada migrasi modul lain. Menunggu UAT manual pengguna.
