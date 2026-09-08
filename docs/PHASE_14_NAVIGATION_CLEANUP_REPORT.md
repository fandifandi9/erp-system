# PHASE 14 — Navigation & Information Architecture Cleanup

**Date:** 2026-08-23  
**Mode:** Implementation terkontrol (navigation / label / visibility only)  
**Source:** Local `B:\Coding\erp-system`  
**Audit input:** `docs/NAVIGATION_SETTINGS_AUDIT.md`

PRODUCTION:  
UNTOUCHED

STAGING:  
UNTOUCHED (tidak di-build, tidak di-deploy, tidak di-restart)

LOCAL:  
CHANGED (source navigation/IA only)

MOBILE:  
Browser viewport: PASS (static CSS / layout review)  
Physical iOS: NOT TESTED  
Physical Android: NOT TESTED

---

## 1. Files changed

### Navigation / IA

| File | Change |
| --- | --- |
| `lib/wms/navigation.ts` | Pecah SDM operasional vs Kinerja vs Laporan & Temuan. HR settings = Peran & Izin + Notifikasi. Helper `isLaporanSdmPath`. |
| `components/Sidebar.tsx` | Sidebar role-aware: HR tidak mendapat seksi Laporan ERP / Pengaturan ERP. Owner `canBisnis` tetap penuh. |
| `components/SidebarNavLinks.tsx` | Label tidak di-`truncate` (hindari teks terpotong di drawer). |
| `components/SidebarAccordionSection.tsx` | Touch target section `min-h-11`. |
| `components/hr/ReportingModuleNav.tsx` | **Baru.** Tab Ringkasan / Laporan Saya / Temuan HR (RBAC). |
| `components/hr/ReportingListPage.tsx` | Pasang module nav. |
| `components/hr/ReportingDetailPage.tsx` | Pasang module nav. |
| `app/(dashboard)/laporan/page.tsx` | HR di-redirect ke `/hr/reports` (Owner tetap hub ERP). |
| `app/(dashboard)/laporan/sdm/page.tsx` | Jadi tab Ringkasan Laporan & Temuan untuk HR; fungsi angka/pintasan **tetap**. |
| `app/(dashboard)/staff/page.tsx` | Hub SDM role-aware (`SDM_NAV_ITEMS_HR` vs `SDM_NAV_ITEMS`). |
| `app/(dashboard)/hr/reports/new/page.tsx` | Module nav. |
| `app/(dashboard)/hr/findings/new/page.tsx` | Module nav. |
| `lib/i18n/nav-catalog.ts` | Section `kinerja`, `laporanTemuan`; label `/hr/reports` = Laporan & Temuan. |
| `lib/i18n/messages/hr-id.ts` | `hr.reporting.nav.*` |
| `lib/i18n/messages/hr-en.ts` | `hr.reporting.nav.*` |
| `lib/i18n/messages/laporan-id.ts` | `titleHr` / `subtitleHr` |
| `lib/i18n/messages/laporan-en.ts` | `titleHr` / `subtitleHr` |
| `mobile/lib/work-dashboard-menu.ts` | Tile personal: **Laporan Saya**. |
| `mobile/app/(tabs)/kerja.tsx` | Section title: **Laporan & Temuan**. |
| `mobile/app/reports/_layout.tsx` | Header: **Laporan Saya**. |

### Sudah role-aware (tidak diubah logic-nya di phase ini)

- `lib/module/role-hub.ts` — hub `/laporan` dan `/pengaturan` sudah memfilter kartu HR.
- `app/(dashboard)/pengaturan/page.tsx` — HR hanya Peran & Izin + Notifikasi.

### Tidak diubah (sengaja)

- Rating server/calc/API/schema/RBAC
- Attendance GPS, Leave lock, Payroll calculation
- Reporting/Findings API + attachment security
- Production / staging deploy
- Route `/staff/*` redirect ke `/hr/*` (tetap dual URL)

---

## 2. Routes changed

Tidak ada route baru. Tidak ada page duplikat.

| Route | Perilaku Phase 14 |
| --- | --- |
| `/hr` | Dashboard SDM HR (tetap). |
| `/staff` | Hub kartu SDM. HR: Dashboard + operasional. Owner: Indeks + operasional. **Tanpa** Rating / Laporan di kartu. |
| `/hr/rating` | Tidak diubah. Hanya pindah ke seksi **Kinerja**. |
| `/hr/reports` | Entry point **Laporan & Temuan**. |
| `/hr/findings` | Tab **Temuan HR** di dalam modul yang sama. |
| `/laporan` | Owner: hub laporan ERP. **HR: `router.replace("/hr/reports")`.** |
| `/laporan/sdm` | Tetap hidup. HR: judul “Ringkasan Laporan & Temuan” + tab modul. Owner: tetap “Laporan SDM” + back ke `/laporan`. |
| `/pengaturan` | HR: 2 kartu (Peran & Izin, Notifikasi). Owner: katalog ERP utuh. |
| `/pengaturan/role`, `/pengaturan/notifikasi` | Tetap. |

Redirect lama `/staff/*` → `/hr/*` **KEEP**.

---

## 3. Navigation changes

### Sidebar HR (target)

**SDM**  
Dashboard (`/hr`), Karyawan, Absensi, Jadwal, Cuti, Lembur, Aktivitas Lapangan, Aktivitas Mencurigakan, Pengaturan GPS, Penggajian

**KINERJA**  
Penilaian / Rating

**LAPORAN & TEMUAN**  
satu entry `/hr/reports`

**PENGATURAN**  
Peran & Izin, Notifikasi

Tidak lagi: “Laporan → Indeks Laporan + SDM” untuk HR.

### Di dalam Laporan & Temuan

Tab (muncul jika ≥ 2 item):

1. **Ringkasan** → `/laporan/sdm` (HR / Owner)
2. **Laporan Saya** → `/hr/reports`
3. **Temuan HR** → `/hr/findings` (hanya jika `canAccess("/hr/findings")`)

Employee: biasanya hanya Laporan Saya → tab disembunyikan (satu tujuan, tidak membingungkan).

### Owner / Admin

Tidak dirusak:

- Katalog, Penjualan, Pembelian, Retur, Gudang, POS
- Keuangan
- Laporan ERP (Indeks, Penjualan, Pembelian, Inventaris, Gudang, Marketplace, SDM)
- Pengaturan ERP (Perusahaan, Akses Entitas, Pengguna, Pajak, Toko, POS, Marketplace, Ekspedisi, Metode Pembayaran, Template Fee MP, Integrasi, …)

Owner dengan `canAccess("/hr")` juga melihat SDM + Kinerja.  
Owner/staf dengan `canAccess("/hr/reports")` melihat Laporan & Temuan.

### Istilah

- **Penggajian** dipakai di nav/hub/i18n.
- Grep UI: tidak ada **Pengajian** (hanya disebut di dokumen audit).
- Rating tetap “Penilaian / Rating”, terpisah dari Laporan & Temuan.

### Icon

Tidak diganti set. Icon existing Lucide (web) / Ionicons (mobile) dipertahankan.

---

## 4. RBAC visibility changes

**Hanya display / navigation.** Permission backend tidak diperluas.

| Role | Yang terlihat | Yang disembunyikan |
| --- | --- | --- |
| Employee (`/hr/reports` di `DEFAULT_USER_ACCESS`) | Laporan & Temuan (laporan milik sendiri via API yang sudah ada) | Pengaturan ERP, Pajak, Toko, POS, Marketplace, Ekspedisi, Payment, Integrasi, Temuan HR |
| HR (`isHrAccount` = user + `role_code=hr`; Owner **bukan** HR) | SDM, Kinerja, Laporan & Temuan, Pengaturan HR | Seksi/kartu Pajak, Toko, POS, Marketplace, Ekspedisi, Metode Pembayaran, Template Biaya MP, Integrasi, Perusahaan, Akses Entitas, Pengguna system |
| Owner / `canBisnis` | Menu ERP + SDM/Kinerja jika berwenang | — |

Hub, bukan hanya sidebar:

- `/laporan` — HR tidak melihat kartu Owner (redirect).
- `/pengaturan` — HR tidak mendapat kartu Toko/POS/Pajak/dll.
- `/staff` — tidak lagi mencampur Rating/Laporan ke kartu SDM.
- Dashboard `/hr` — kartu tetap operasional SDM + Rating + Laporan/Temuan; **tanpa** kartu ERP.

`isHrAccount` vs Owner sudah benar: Owner tidak di-redirect keluar dari `/laporan`.

---

## 5. Mobile viewport test

**Metode:** review CSS/layout source. Browser MCP interaktif **tidak tersedia**. Login 3 role di viewport **tidak dijalankan**.

Ini **bukan** UAT perangkat fisik.

| Check (360 / 390 / 430) | Evidence | Status |
| --- | --- | --- |
| Drawer lebar | `w-[min(19rem,90vw)]` | PASS |
| Drawer scroll | `overflow-y-auto overscroll-contain max-h-[100dvh]` | PASS |
| Horizontal overflow sidebar | Label wrap (`leading-snug`), bukan `truncate` | PASS |
| Touch target | `min-h-11` (~44px) pada item + accordion | PASS |
| Tab modul | `overflow-x-auto`, `shrink-0`, `min-h-11`, tidak memaksa wrap yang potong kata | PASS |
| Hub cards | `grid-cols-1` di mobile | PASS |
| Icon size | Lucide `h-4 w-4` sidebar; Ionicons existing di app | PASS |
| Active state | Amber pada item aktif; accordion terbuka jika path aktif | PASS |
| Duplikasi menu HR | Satu entry Laporan & Temuan; Rating di Kinerja | PASS |
| Kartu Owner bocor ke HR | Hub + sidebar role-aware | PASS (code) |

Browser viewport: **PASS** (static)  
Interactive click/open drawer: **NOT TESTED**  
Physical iOS: **NOT TESTED**  
Physical Android: **NOT TESTED**

---

## 6. Tests executed

| Test | Result |
| --- | --- |
| ESLint file Phase 14 | **PASS** (0 error). 4 warning unused-import **pre-existing** di `lib/wms/navigation.ts` — tidak disentuh. |
| `tsc --noEmit` (seluruh repo) | **FAIL** — error **di luar** Phase 14 (retur `"resend"`, WMS picking Timeout, qz-tray types, `reporting-server` Uint8Array, dll.). File Phase 14: **0 error**. |
| `npm run test:hr-rating-unit` | **PASS** 24/24 |
| `npm run test:hr-reporting-unit` | **PASS** 5/5 |
| `npm run test:hr-wave1` | **PASS** 16/16 assertion. Proses Node Windows crash *setelah* summary (`UV_HANDLE_CLOSING`) — **WARN** pre-existing, bukan regresi nav. |
| Attendance unit khusus | Tidak ada script unit terpisah. `test:hr-attendance-api-staging` **tidak dijalankan** (staging/API, di luar scope nav). |
| Staging Next build | **TIDAK DIJALANKAN** — diblokir error TypeScript WIP yang sudah ada. Tidak di-deploy. |

---

## 7. PASS / FAIL / WARN

| Item | Status |
| --- | --- |
| Struktur menu HR sesuai IA | **PASS** |
| Istilah Penggajian / Rating / Laporan & Temuan | **PASS** |
| Visibility HR tanpa ERP leak (code) | **PASS** |
| Owner menu ERP tetap ada (code) | **PASS** |
| Laporan ≠ Temuan ≠ Rating (konsep + nav) | **PASS** |
| Functionality `/laporan/sdm` tidak dihapus | **PASS** |
| Permission backend tidak diperluas | **PASS** |
| Production untouched | **PASS** |
| Rating/Attendance/Leave/Payroll/Reporting API logic untouched | **PASS** |
| Interactive smoke 3 role di browser | **WARN** — tidak dijalankan |
| Staging build | **WARN** — blocked by pre-existing TS WIP |
| Rating 503 di localhost → PB production | **WARN** expected (bukan bug nav) |
| Chunk/logo 404 staging standalone | **WARN** ops (phase sebelumnya); tidak diperbaiki di sini |
| Node wave1 exit crash Windows | **WARN** pre-existing |

---

## 8. Remaining blockers (bukan Phase 14)

Jangan diperbaiki di phase ini:

1. **Rating 503 di Local** — Next local memakai PocketBase production; koleksi `hr_rating_*` tidak ada di PB itu. Expected.
2. **Staging asset 404** (`.next/static`, `/systemLogoWide.png`) — copy standalone `public` + static; ops/deploy, bukan IA.
3. **Schema Reporting/Findings** mungkin belum di semua PB — 503 jika koleksi belum di-apply. Attachment/API tidak diubah.
4. **TypeScript repo FAIL** — retur/WMS/qz-tray/reporting-server; WIP di luar nav.
5. **Working tree kotor** — banyak perubahan bisnis/WMS/staging overlay. Phase 14 jangan di-commit campur dengan itu kecuali diminta.
6. **Physical device UAT** — setelah staging stabil + build app.
7. **Interactive nav smoke** (Employee / HR / Owner login) — setelah lingkungan Local/staging punya akun uji yang tidak menulis production.

---

## 9. Production safety confirmation

- Tidak ada deploy production.
- Tidak ada restart production Next / PocketBase.
- Tidak ada mutasi database / schema / PB production.
- Tidak ada perubahan Rating calculation, Attendance GPS, Leave lock, Payroll calc, Reporting/Findings API, attachment magic-byte, auth backend.

PRODUCTION:  
UNTOUCHED

STAGING:  
UNTOUCHED

LOCAL:  
Source navigation/IA updated. Dev server yang sudah berjalan akan hot-reload file ini. Tidak ada packaging/release.

MOBILE:  
Browser viewport: PASS  
Physical iOS: NOT TESTED  
Physical Android: NOT TESTED
