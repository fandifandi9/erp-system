# PHASE 16 — STAGING CLEANUP & SYNC

**Date:** 2026-08-27  
**Mode:** STAGING CLEANUP / SYNCHRONIZATION ONLY

## Environment

**Local:**  
Next.js `http://localhost:3000` · PocketBase `http://127.0.0.1:8090`  
HEAD: `7adfe7b5377ffc755d86128d7a2235f88478672a` (`docs: save 14 Aug handoff…`, 2026-08-14)  
Baseline UI/IA: working tree Local yang sudah lulus Phase 14D / 15B (sebagian besar **belum** di-commit; overlay selektif, bukan dirty tree penuh).

**Staging:**  
Next.js `https://staging.serba.space` (`127.0.0.1:3002`, PM2 `erp-system-staging`)  
PocketBase `https://pb-staging.serba.space` (`127.0.0.1:8092`, PM2 `pb-erp-staging`)  
Client PB: `https://staging.serba.space/_pb`  
BUILD_ID setelah Phase 16: **`YIQDKSU3jCwTTtYalpxPi`**  
BUILD_ID sebelum: `UOD-nzTLUN_0CnGBQjG8o`

**Production:**  
Next.js `https://serba.space` (`/var/www/erp`, PM2 `erp-system` pid **228060**, uptime **30D**, tidak di-restart)  
PocketBase `https://pb.serba.space` (`/var/www/pocketbase-erp`, PM2 `pb-erp` pid **228058**, uptime **30D**)  
Shop `shop-system` pid **228059**, uptime **30D**

---

## Before

Staging `/pengaturan` untuk HR menampilkan katalog Owner: Perusahaan, Konteks Kerja, Akses Entitas, Toko, Master POS, Pengguna, Master Marketplace, Ekspedisi, Pajak / PPN, Jatuh Tempo, Metode Pembayaran, Template Biaya MP, Peran & Izin, Notifikasi, Integrasi, Log Audit.

Staging sidebar HR masih memakai seksi **Laporan** (`LAPORAN_NAV_ITEMS_HR`: Indeks + Laporan SDM), bukan **Kinerja** + **Laporan & Temuan**.

Tidak ada route `/hr/reports`, `/hr/findings`, atau API reporting di tree staging. Rating API sudah ada (Phase 12 overlay).

---

## Root Cause

Staging menjalankan **archive + overlay lama** (Phase 12 era), bukan baseline Local Phase 14/15B.

1. **Bukan** bug RBAC API penjualan: middleware tetap menolak HR ke modul ERP.
2. **Ya** masalah navigation/UI: `pengaturan/page.tsx` dan `laporan/page.tsx` staging memakai `PENGATURAN_NAV_ITEMS` / `LAPORAN_NAV_ITEMS` penuh (katalog Owner) tanpa `lib/module/role-hub.ts`.
3. Route Owner (Toko, Pajak, dll.) **masih terdaftar** — benar untuk Owner; salah jika diindeks untuk HR.
4. Staging **stale** relatif ke Local: Phase 14 (IA) dan Phase 13 (Laporan & Temuan) tidak pernah di-overlay + rebuild.
5. Commit Local `7adfe7b` adalah handoff 14 Agu; IA Phase 14 ada di working tree, bukan di HEAD itu.

Tidak ada perubahan schema/business logic Production.

---

## Changes

Tidak ada commit Git. Overlay **hanya** ke `/var/www/erp-staging`. Backup: `/var/www/erp-staging-backups/phase16-pre-20260827T093757Z.tgz`.

**Navigation / IA**

- `lib/module/role-hub.ts` (baru di staging)
- `lib/wms/navigation.ts`
- `lib/rbac.ts` (`/hr/reports`, `/hr/findings` di KNOWN_ROUTES + akses HR/employee)
- `lib/i18n/nav-catalog.ts`
- `lib/i18n/messages/hr-id.ts`, `hr-en.ts`, `hubs-id.ts`, `hubs-en.ts`, `laporan-id.ts`, `laporan-en.ts`, `pengaturan-id.ts`, `pengaturan-en.ts`
- `components/Sidebar.tsx`, `SidebarNavLinks.tsx`, `SidebarAccordionSection.tsx`
- `app/(dashboard)/pengaturan/page.tsx`, `pengaturan/role/page.tsx`
- `app/(dashboard)/laporan/page.tsx`, `laporan/sdm/page.tsx`
- `app/(dashboard)/staff/page.tsx`

**Reporting & Findings (source existing, bukan logic baru)**

- `lib/hr/reporting-types.ts`, `reporting-validate.ts`, `reporting-server.ts`, `reporting-http.ts`, `reporting-client.ts`, `compress-evidence-image.ts`
- `components/hr/ReportingModuleNav.tsx`, `ReportingListPage.tsx`, `ReportingDetailPage.tsx`, `ReportingCaseList.tsx`, `ReportingCaseForm.tsx`, `EvidencePicker.tsx`, `EvidenceViewer.tsx`, `RatingModuleNav.tsx`
- `app/(dashboard)/hr/reports/**`, `hr/findings/**`
- `app/api/hr/reports/**`, `app/api/hr/findings/**`

**Build fix (tipe saja, bukan validasi attachment)**

- `lib/hr/reporting-server.ts`: salin `Uint8Array` sebelum `new Blob(...)` agar tsc Next 16 staging lulus. Magic-byte / 10 MB / MIME **tidak** diubah.

**Deploy helper**

- `scripts/copy-standalone-assets.mjs` disalin ke staging agar `.next/static` masuk standalone.

**Tidak di-overlay (sengaja)**

- `lib/hr/rating-server.ts` / calc / smart-random (algoritma Rating tetap milik staging Phase 12)
- Attendance/GPS, Leave, Retur/WMS WIP, middleware Production, `/var/www/erp`

---

## Navigation

**Owner:**  
Menu ERP tetap: Katalog, Penjualan, Pembelian, Retur (item nav Local), Gudang, POS, Keuangan, Laporan ERP, Pengaturan katalog penuh. SDM Owner tetap indeks `/staff`. Kinerja + Laporan & Temuan tampil jika `canAccess("/hr")` / `canAccess("/hr/reports")`.

**HR:**  
SDM: Dashboard `/hr`, Karyawan, Absensi, Jadwal, Cuti, Lembur, Aktivitas Lapangan, Aktivitas Mencurigakan, Pengaturan GPS, **Penggajian**.  
Kinerja: Penilaian / Rating.  
Laporan & Temuan: satu pintu `/hr/reports`.  
Pengaturan: Peran & Izin, Notifikasi.  
Tidak di sidebar/hub: Pajak, Toko, POS, Marketplace, Ekspedisi, Metode Pembayaran, Template Biaya MP, Integrasi.

**Employee:**  
Dasbor staf existing. `/hr/reports` di `DEFAULT_USER_ACCESS`. Temuan HR: API **403** (bukan hak). Tidak mendapat menu ERP Owner.

---

## Rating

**Status:** PASS (API live)

`GET /api/hr/rating/my-tasks` dengan token HR staging = **200**. Server logic tidak diubah. UI nav memakai `RatingModuleNav` overlay. Resubmit/lock/privacy tetap di API existing.

---

## Reporting & Findings

**Status:** PARTIAL (source + auth PASS; data PB belum)

| Cek | Hasil |
| --- | --- |
| Route `/hr/reports`, `/hr/findings` | Ada di build staging |
| API unauthenticated | **401** (bukan public) |
| HR `GET /api/hr/reports` | **500** `The requested resource wasn't found.` — koleksi `hr_staff_reports` belum ada di PB staging |
| Employee `GET /api/hr/findings` | **403** |
| Attachment public | Tidak; URL tetap Next auth-gated |

Schema staging `pb-apply-hr-reporting-schema-staging.mjs` **tidak** dijalankan dari workstation: `POCKETBASE_STAGING_URL=http://127.0.0.1:8092` memerlukan tunnel SSH. Tanpa tunnel, write bisa mengenai proses lokal yang salah. Production PB **tidak** disentuh.

---

## I18N

**ID:** katalog overlay (`Penggajian`, `Penilaian / Rating`, `Laporan & Temuan`, `Peran & Izin`).  
**EN:** `hr-en` / `hubs-en` / `laporan-en` / `nav-catalog` ikut.  
Login watermark tetap `v2.8` (tidak di-overlay).

---

## Mobile Source Review

Web drawer/sidebar overlay: `w-[min(19rem,90vw)]`, `min-h-11`, overlay backdrop, safe-area padding.

| Viewport | Status |
| --- | --- |
| 360 | SOURCE REVIEW (CSS drawer) — tidak diukur di browser login |
| 390 | SOURCE REVIEW |
| 430 | SOURCE REVIEW |

Physical iOS: **NOT TESTED**  
Physical Android: **NOT TESTED**

Expo/EAS **tidak** di-build.

---

## Tests

| Suite | Result |
| --- | --- |
| Rating unit | **PASS=24 FAIL=0** |
| Reporting unit | **PASS=5 FAIL=0** |
| Leave `test-hr-wave2-leave` | **PASS=12 FAIL=0** (Wave 2B staging lock probe SKIPPED; production tidak dimodifikasi) |
| Mobile TypeScript | **PASS** |

WIP retur/WMS: tidak diuji, tidak diperbaiki.

---

## Staging Smoke

| Role / area | Status |
| --- | --- |
| Owner | Menu ERP **tetap di source** `canBisnis`. Login Owner live tidak dijalankan (tidak ada smoke-owner). Production login `https://serba.space/login` **200**, proses 30D. |
| HR | Login `smoke-hr@serba.test` PB staging **200**. Source hub/sidebar HR tanpa Pajak/Toko/POS/MP/Ekspedisi. Rating API **200**. |
| Employee | Login `smoke-employee@serba.test` **200**. Findings API **403**. |
| Rating | PASS |
| Reporting | PARTIAL — UI/API terpasang; list 500 karena koleksi PB belum di-apply |
| Attachment | Unauth **401**. Bukan public upload. |

BUILD_ID baru ada di HTML login. Chunk JS `application/javascript` **200**.

---

## Production Safety

**Production: UNTOUCHED**

| Item | Evidence |
| --- | --- |
| Production process/restart | pid `erp-system` 228060, `pb-erp` 228058, `shop-system` 228059 — sama sebelum & sesudah deploy; uptime 30D |
| Production HEAD/build | Tidak di-rebuild. Login production tetap 200. |
| Production schema | Tidak ada migration/script ke `pb.serba.space` / `:8091` |
| Production collections | Tidak diubah |
| Production deployment | Tidak dilakukan. Hanya `pm2 restart erp-system-staging` |

Staging Next: **UPDATED FOR PHASE 16**.  
Staging PB process: **tidak di-restart** (15D).

---

## Remaining Issues

1. **Koleksi reporting staging belum ada** (`hr_staff_reports`, `hr_findings`, `hr_case_attachments`). Setelah tunnel `8092`, jalankan `node scripts/pb-apply-hr-reporting-schema-staging.mjs` (guard menolak production). Lalu UAT buat laporan + unggah bukti.
2. Hub kartu HR setelah login belum diverifikasi di browser (hanya source + API). Perlu UAT Owner/HR di `https://staging.serba.space`.
3. Viewport 360/390/430: source saja, bukan physical device.
4. Working tree Local tetap kotor (WIP retur/WMS) — **jangan** `git add -A`.

---

## STATUS

PHASE 16 STAGING CLEANUP — **IA/NAV DEPLOYED**

Reporting live data: **PARTIAL** (tunggu schema staging)

PRODUCTION: **UNTOUCHED**

Tidak ada production deployment. Tidak membuat Phase berikutnya. Menunggu approval Owner (termasuk apply schema reporting staging jika UAT laporan dibutuhkan).
