# PHASE 14C — Local Final Stabilization

**Date:** 2026-08-23  
**Mode:** Validasi Local only. Tidak ada deploy. Tidak ada perubahan schema/fitur.  
**Phase 14 source:** `docs/PHASE_14_NAVIGATION_CLEANUP_REPORT.md`

LOCAL:  
CONDITIONAL

PRODUCTION:  
UNTOUCHED

STAGING:  
UNTOUCHED

PHYSICAL MOBILE:  
NOT TESTED

---

## Local environment

| Check | Result |
| --- | --- |
| `.env.local` `NEXT_PUBLIC_POCKETBASE_URL` | **PRODUCTION** (`pb.serba.space`) — **tidak dipakai untuk uji Phase 14C** |
| PocketBase Local `127.0.0.1:8090` | **DOWN** (tidak ada proses, tidak ada `pb_data` / binary di repo) |
| Staging tunnel `127.0.0.1:8092` | **DOWN** — tidak dipakai; staging juga tidak di-deploy |
| Production PB `:8091` / `pb.serba.space` | **DITOLAK** untuk testing (sesuai instruksi) |
| `npm run dev` yang sedang jalan | Menggunakan `.env.local` → PB production. **Tidak di-login, tidak di-smoke write.** |
| `npm run smoke:seed` / `smoke:test` | **TIDAK DIJALANKAN** — script membaca `.env.local` dan akan menulis/membaca production |

**Kesimpulan environment:** Local Next **tidak** memiliki PocketBase Local yang sehat. Tidak ada instance 8090. Menjalankan uji login interaktif pada `npm run dev` saat ini akan mengenai production. Itu **ditolak**.

Aplikasi Local yang “benar” (Next + PB `127.0.0.1:8090`) **belum tersedia** di workstation ini. Tidak dibuat instance PB baru (akan memerlukan schema/data — di luar scope).

---

## Owner test

| Langkah | Status | Catatan |
| --- | --- | --- |
| login | NOT TESTED | Tidak ada PB Local; login ke production dilarang |
| dashboard | NOT TESTED | Code: Owner → `/dashboard-owner` (`getOperationalDashboardRoute`) |
| SDM | PASS (code) | `SDM_NAV_ITEMS` jika `canAccess("/hr")` |
| Rating | PASS (code) | Seksi **Kinerja** → `/hr/rating` jika `canAccess("/hr")` |
| Laporan & Temuan | PASS (code) | Tampil jika `canAccess("/hr/reports")` (`*` Owner) |
| Pengaturan | PASS (code) | `canBisnis` → `PENGATURAN_NAV_ITEMS` lengkap (Pajak, Toko, POS, …) |
| logout | NOT TESTED | — |

**Interactive Owner:** NOT TESTED

---

## HR test

| Langkah | Status | Catatan |
| --- | --- | --- |
| login | NOT TESTED | Sama: tidak ada PB Local |
| dashboard | PASS (code) | `/hr` di dalam seksi SDM |
| SDM | PASS (code) | `SDM_NAV_ITEMS_HR`: Dashboard + operasional (Penggajian, tanpa Rating) |
| Rating | PASS (code) | Seksi **Kinerja** → Penilaian / Rating |
| Laporan & Temuan | PASS (code) | Satu entry `/hr/reports`; `/laporan` di-redirect ke situ |
| Pengaturan | PASS (code) | `PENGATURAN_NAV_ITEMS_HR`: Peran & Izin, Notifikasi saja |
| logout | NOT TESTED | — |

### HR visibility (code review)

**Harus terlihat — ada di source:**

- SDM (Dashboard, Karyawan, Absensi, Jadwal, Cuti, Lembur, Aktivitas Lapangan, Aktivitas Mencurigakan, Pengaturan GPS, Penggajian)
- Kinerja → Penilaian / Rating
- Laporan & Temuan
- Pengaturan → Peran & Izin, Notifikasi

**Tidak boleh terlihat — tidak ada di `PENGATURAN_NAV_ITEMS_HR` / tidak di-render jika `!canBisnis`:**

- Pajak / PPN
- Toko
- POS
- Marketplace
- Ekspedisi
- Metode Pembayaran
- Template Biaya MP
- Integrasi ERP

Hub `/pengaturan` memakai `selectPengaturanNavItems` → subset HR.  
Hub `/laporan` untuk `isHrAccount` → `router.replace("/hr/reports")`.

**WARN (edge case, tidak diubah di 14C):** jika akun `role_code=hr` *juga* punya `inventory_role` admin/supervisor, `canBisnis` menjadi true dan Sidebar menampilkan menu ERP Owner. HR standar (`inventory_role=none`) tidak kena. Perbaikan akan berupa `canBisnis && !isHr` — ditunda sampai approval Owner.

**Interactive HR:** NOT TESTED

---

## Employee test

| Langkah | Status | Catatan |
| --- | --- | --- |
| login | NOT TESTED | Tidak ada PB Local |
| dashboard | PASS (code) | `/dashboard-staff` jika `dashboard_access`; selain itu profil |
| SDM | PASS (code) | Seksi SDM **tidak** tampil (`canAccess("/hr")` false) |
| Rating | PASS (code) | Seksi Kinerja **tidak** tampil |
| Laporan & Temuan | PASS (code) | Tampil jika path `/hr/reports` (ada di `DEFAULT_USER_ACCESS`) |
| Pengaturan | PASS (code) | Tidak tampil (`!canBisnis && !canManageHr`) |
| logout | NOT TESTED | — |

Employee tidak melihat Pajak/Toko/POS/Marketplace/Ekspedisi/Payment/Integrasi di sidebar (code).

**Interactive Employee:** NOT TESTED

---

## Navigation

| Item | Status |
| --- | --- |
| Struktur HR (SDM / Kinerja / Laporan & Temuan / Pengaturan HR) | PASS (code) |
| Satu pintu Laporan & Temuan (bukan Indeks + SDM) | PASS (code) |
| Tab Ringkasan / Laporan Saya / Temuan HR | PASS (code) |
| Rating terpisah dari Laporan | PASS (code) |
| Owner menu ERP tetap | PASS (code) |
| Istilah **Penggajian** (bukan Pengajian) | PASS — grep `*.ts/tsx/js/jsx`: 0 “Pengajian”; `staff_payroll` = Penggajian |
| Route baru / page duplikat | Tidak ada |

---

## Rating

| Test | Result |
| --- | --- |
| `npm run test:hr-rating-unit` | **PASS=24 FAIL=0** |
| Business logic diubah? | **Tidak** |

Rating 503 pada `npm run dev` saat ini = expected jika Next mengarah ke PB production (koleksi Rating tidak ada di situ). **Bukan regresi Phase 14.** Tidak diuji live.

---

## Reporting / Findings

| Test | Result |
| --- | --- |
| `npm run test:hr-reporting-unit` | **PASS=5 FAIL=0** |
| API / attachment / schema diubah? | **Tidak** |

Live create/list laporan **NOT TESTED** (butuh PB Local + login).

---

## Leave

| Check | Result |
| --- | --- |
| Phase 14 menyentuh Leave API / lock? | **Tidak** (file Phase 14 = nav/i18n/sidebar/hub) |
| `npm run test:hr-wave2-leave` | **PASS=12 FAIL=0** (policy unit + unauth 401 ke Next Local) |
| Live role leave | NOT RUN (butuh cookie) |
| Staging write-lock probe | SKIPPED — `127.0.0.1:8092` down; production tidak disentuh |

**Unrelated existing WIP:** `lib/leave.ts` dirty di working tree (bukan Phase 14). Tidak diperbaiki.

---

## Attendance

| Check | Result |
| --- | --- |
| Phase 14 menyentuh GPS / auth / Attendance API? | **Tidak** |
| Unit attendance khusus | Tidak ada script unit terpisah |
| `test:hr-attendance-api-staging` | **TIDAK DIJALANKAN** — butuh staging PB `:8092` + admin staging; staging UNTOUCHED |

**Unrelated existing WIP:** `lib/attendance.ts` dirty di working tree (bukan Phase 14). Tidak diperbaiki.

---

## Mobile viewport

**Metode:** review CSS/layout Phase 14. Browser MCP tidak tersedia. Login + buka drawer pada 360/390/430 **tidak dijalankan** (akan memerlukan sesi pada PB production atau Local yang tidak ada).

| Check | Evidence | Status |
| --- | --- | --- |
| Drawer width | `w-[min(19rem,90vw)]` | PASS (static) |
| Scroll menu | `overflow-y-auto overscroll-contain max-h-[100dvh]` | PASS (static) |
| Horizontal overflow | label wrap, bukan truncate | PASS (static) |
| Touch target | `min-h-11` item + accordion | PASS (static) |
| Rating / Laporan & Temuan / Pengaturan terpotong | section title `leading-snug`; label wrap | PASS (static) |
| Interactive 360 / 390 / 430 | — | NOT TESTED |
| Physical iOS | — | NOT TESTED |
| Physical Android | — | NOT TESTED |

Jangan dianggap UAT perangkat.

---

## TypeScript

`npx tsc --noEmit` → **FAIL**

| Error | Class |
| --- | --- |
| `app/(dashboard)/bisnis/retur/[id]/page.tsx` `"resend"` | **D. UNRELATED EXISTING WIP ERROR** |
| `components/bisnis/SalesReturWmsStatementCard.tsx` + `lib/bisnis/sales-retur-*.ts` + WMS resend | **D. UNRELATED EXISTING WIP ERROR** |
| `WmsPickingContent.tsx` Timeout | **D. UNRELATED EXISTING WIP ERROR** |
| `lib/wms/qz-print.ts`, `dashboard-stats-server.ts` | **D. UNRELATED EXISTING WIP ERROR** |
| `lib/hr/reporting-server.ts` Uint8Array / BlobPart | **C. Reporting (pre-existing type)** — bukan Phase 14; business logic tidak diubah |
| File Phase 14 (Sidebar, navigation, role-hub, ReportingModuleNav, laporan/*, staff, nav-catalog) | **0 error** |

Tidak ada perbaikan WIP.

---

## Build

`npm run build` (Local compile only, **tidak di-deploy**):

- Compile Turbopack: **sukses** (~118s)
- Typecheck Next: **FAIL** pada retur `"resend"`  
  **Class: D. UNRELATED EXISTING WIP ERROR**
- Bukan Phase 14, bukan Rating logic, bukan Reporting logic

Artifact build **tidak** boleh di-ship: proses membaca `.env.local` (URL PB production di `NEXT_PUBLIC_*`).

Warning WMS `unboxing-media-storage` (trace terlalu lebar) = **D**, tidak diperbaiki.

---

## Known unrelated WIP

1. Retur / WMS TypeScript (`workflow_phase === "resend"`, picking Timeout, qz-tray).
2. Dirty `lib/leave.ts`, `lib/attendance.ts` (bukan commit Phase 14).
3. `reporting-server` BlobPart type (Phase 13, bukan nav).
4. Working tree besar (overlay staging, bisnis, WMS).
5. `.env.local` mengarah ke PB production — `npm run dev` **bukan** stack Local yang aman untuk UAT.
6. Tidak ada PocketBase Local `:8090`.
7. Node `test:hr-wave1` crash libuv Windows *setelah* PASS 16/16 (pre-existing).

---

## Production safety

- Tidak ada deploy production.
- Tidak ada deploy staging.
- Tidak ada mutasi PB production / staging.
- Tidak ada `smoke:seed` terhadap `.env.local`.
- Tidak ada login uji ke `pb.serba.space`.
- Tidak ada perubahan schema.
- Tidak ada perubahan Rating / Reporting / Leave / Attendance business logic.
- Tidak ada perbaikan WIP retur/WMS.

---

## Final status

| Gate | Status |
| --- | --- |
| Phase 14 navigation code | PASS |
| Rating unit | PASS (24/0) |
| Reporting unit | PASS (5/0) |
| Leave local smoke | PASS (12/0; live/staging skip) |
| Attendance | NOT REGRESSED by Phase 14; live NOT TESTED |
| TypeScript Phase 14 files | PASS |
| TypeScript / build repo | FAIL — unrelated WIP |
| Interactive Owner / HR / Employee | NOT TESTED (no Local PB) |
| Mobile viewport interactive | NOT TESTED |
| Physical mobile | NOT TESTED |

LOCAL:  
CONDITIONAL

PRODUCTION:  
UNTOUCHED

STAGING:  
UNTOUCHED

PHYSICAL MOBILE:  
NOT TESTED

---

## Stop

Phase 14C selesai. Tidak ada deploy. Tidak ada perubahan tambahan.

**Blocker untuk Local UAT interaktif:** sediakan PocketBase Local (`127.0.0.1:8090`) + Next yang **tidak** memakai `pb.serba.space` / `:8091`, lalu uji login Owner / HR / Employee.

Menunggu approval Owner untuk phase berikutnya.
