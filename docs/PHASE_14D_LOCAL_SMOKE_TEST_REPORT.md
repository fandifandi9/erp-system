# PHASE 14D — Local Environment & Real Smoke Test

**Date:** 2026-08-27  
**Mode:** Local stack + real login smoke. Tidak ada deploy.

LOCAL Next:  
http://localhost:3000

LOCAL PocketBase:  
http://127.0.0.1:8090

STAGING:  
UNCHANGED

PRODUCTION:  
UNCHANGED

PHYSICAL MOBILE:  
NOT TESTED

---

## 1. Local environment

**Audit (sebelum ubah):**

| Item | Temuan |
| --- | --- |
| `.env.example` | Sudah `NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090` |
| `.env.local` (awal) | Mengarah ke **production** `pb.serba.space` |
| `package.json` | Ada `smoke:seed` / `smoke:test`. **Tidak** ada `pb:local` / `pocketbase serve` |
| `pb/README.md` | Schema penuh **tidak** di Git; bootstrap dari Git saja tidak mungkin |
| Binary / `pb_data` | Tidak ada di repo (`pb_data/` gitignored) |

**Tindakan 14D (Local only):**

1. Backup `.env.local` → `.env.local.production-backup` (gitignored). Production env **tidak dihapus**.
2. `.env.local` diarahkan ke `http://127.0.0.1:8090` + admin Local `local-admin@serba.local` (bukan admin production).
3. `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
4. `npm run dev` di-restart agar client bundle memakai `127.0.0.1:8090` (terverifikasi di chunk `/_next/static/chunks/app/layout.js`).

Tidak ada perubahan env production server / staging.

---

## 2. PocketBase local

Repo **tidak** punya mekanisme resmi `npm run pb:local`. Dibuat runner Local:

- Binary: PocketBase **0.22.27** Windows amd64 di `tools/local-pb/` (gitignored)
- Bind: `127.0.0.1:8090`
- Data: `./pb_data` (gitignored)
- Script: `scripts/bootstrap-local-pb.mjs` — menolak host production/staging (`pb.serba.space`, `:8091`, `:8092`, `pb-staging`)
- Health: `GET http://127.0.0.1:8090/api/health` → `{"code":200,...}`
- Schema Local minimal: `users` (field RBAC + `session_nonce`) + `profiles` — cukup untuk login + sidebar. Bukan clone production/staging.

Admin Local **bukan** email/password production.

---

## 3. Seed

`npm run smoke:seed` dijalankan **setelah** `.env.local` mengarah ke `:8090`.

Log: `PB: http://127.0.0.1:8090`

| Akun (script resmi) | Email | role_code | inventory_role |
| --- | --- | --- | --- |
| HR Admin | `smoke-hr@serba.test` | hr | none |
| Employee | `smoke-employee@serba.test` | staff | none |
| Warehouse / Supervisor / Admin bisnis | `smoke-*@serba.test` | staff | sesuai seed |

Password: `SMOKE_PASSWORD` di `.env.local` (shared dummy; **bukan** akun production).

**Owner:** `npm run smoke:seed` **tidak** membuat Owner. Fixture Local 14D: `smoke-owner@serba.test` (`account_type=owner`) dibuat oleh bootstrap Local. Bukan seed baru yang ditulis ke production.

---

## 4. Owner login

| Langkah | Result | Evidence |
| --- | --- | --- |
| login | **PASS** | `http://localhost:3000/dashboard-owner` |
| dashboard | **PASS** | `/dashboard-owner` |
| logout | **PASS** | kembali `/login` |

---

## 5. HR login

| Langkah | Result | Evidence |
| --- | --- | --- |
| login | **PASS** | `http://localhost:3000/hr` |
| dashboard | **PASS** | `/hr` |
| logout | **PASS** | `/login` |

---

## 6. Employee login

| Langkah | Result | Evidence |
| --- | --- | --- |
| login | **PASS** | `http://localhost:3000/dashboard-staff` |
| dashboard | **PASS** | `/dashboard-staff` |
| logout | **PASS** | `/login` |

---

## 7. HR navigation

Interactive click (Chrome, Playwright, Local):

| Check | Result |
| --- | --- |
| SDM items (Dashboard … Penggajian) | **PASS** — all present |
| Kinerja → Penilaian / Rating | **PASS** — klik → `/hr/rating` |
| Laporan & Temuan | **PASS** — klik → `/hr/reports` |
| Pengaturan → Peran & Izin | **PASS** — klik → `/pengaturan/role` |
| Notifikasi (label di sidebar) | **PASS** (dalam required set) |
| Pajak / PPN, Toko, Marketplace, Ekspedisi, Metode Pembayaran, Template, Integrasi | **PASS** — none leaked |
| POS / Kasir POS | **PASS** — tidak tampil |

---

## 8. Owner navigation

Sidebar Owner (setelah login):

`Dasbor · Katalog Produk · Penjualan · Pembelian · Retur · Manajemen Gudang · POS · SDM · Kinerja · Laporan & Temuan · Keuangan · Laporan · Pengaturan`

Menu ERP Owner **tetap tersedia**. Permission tidak dikurangi.

---

## 9. Employee navigation

Sidebar Employee:

`Dasbor · Laporan & Temuan`

| Check | Result |
| --- | --- |
| Laporan & Temuan sesuai permission | **PASS** |
| Tidak ada SDM HR (Karyawan, dll.) | **PASS** |
| Tidak ada Kinerja / Rating | **PASS** |
| Tidak ada Pajak / Toko | **PASS** |

---

## 10. Rating regression

`npm run test:hr-rating-unit`

**PASS=24 FAIL=0**

Rating business logic tidak diubah.

---

## 11. Reporting regression

`npm run test:hr-reporting-unit`

**PASS=5 FAIL=0**

Reporting/Findings logic tidak diubah.

---

## 12. Leave regression

`npm run test:hr-wave2-leave` (setelah Next Local ready)

**PASS=12 FAIL=0**

Leave logic tidak diubah. Staging write-lock probe tetap SKIP (staging UNTOUCHED).

---

## 13. Mobile viewport interactive test

Chrome device emulation, **bukan** CSS-only. Login HR, buka drawer, expand SDM/Kinerja/Laporan/Pengaturan, scroll.

| Width | Overflow | Drawer | Penggajian | Rating | Laporan & Temuan |
| --- | --- | --- | --- | --- | --- |
| 360px | PASS | PASS | PASS | PASS | PASS |
| 390px | PASS | PASS | PASS | PASS | PASS |
| 430px | PASS | PASS | PASS | PASS | PASS |

`document.scrollWidth === clientWidth` (tidak ada horizontal overflow).

Physical iOS: **NOT TESTED**  
Physical Android: **NOT TESTED**

---

## 14. Build

`npm run build` (Local compile, **tidak di-deploy**):

- Compile: **sukses** (~119s)
- Typecheck: **gagal** pada `app/(dashboard)/bisnis/retur/[id]/page.tsx` `workflow_phase === "resend"`

**Class: UNRELATED EXISTING WIP TYPECHECK ERROR** — tidak diperbaiki.

Env yang terbaca build: `.env.local` → `127.0.0.1:8090` (bukan production URL).

---

## 15. Known unrelated WIP

- Retur/WMS TypeScript `"resend"`
- Working tree bisnis/WMS di luar Phase 14
- Schema Local **minimal** (bukan 369 migrasi production) — halaman ERP Owner bisa kosong/error data; **navigasi** yang diuji
- `npm run smoke:seed` tidak mencakup Owner (fixture Owner hanya Local bootstrap)
- Playwright ada di `node_modules` sesi ini; **tidak** ditambahkan ke `package.json`

---

## 16. Production safety

- Tidak deploy production
- Tidak mutasi PB production / schema / data
- Tidak `smoke:seed` ke `pb.serba.space`
- Admin Local ≠ admin production
- Backup env production hanya file gitignored di workstation

PRODUCTION:  
UNTOUCHED

---

## 17. Staging safety

- Tidak deploy staging
- Tidak memakai `:8092` / `pb-staging.serba.space`
- Leave staging lock probe SKIP

STAGING:  
UNTOUCHED

---

## Final scorecard

| Gate | Status |
| --- | --- |
| LOCAL ENVIRONMENT | **PASS** |
| OWNER LOGIN | **PASS** |
| HR LOGIN | **PASS** |
| EMPLOYEE LOGIN | **PASS** |
| HR NAVIGATION | **PASS** |
| OWNER NAVIGATION | **PASS** |
| EMPLOYEE NAVIGATION | **PASS** |
| RATING | **PASS** |
| REPORTING | **PASS** |
| LEAVE | **PASS** |
| MOBILE VIEWPORT | **PASS** (browser emulation) |
| BUILD | **CONDITIONAL** (compile OK; typecheck retur WIP) |

PRODUCTION:  
UNTOUCHED

STAGING:  
UNTOUCHED

PHYSICAL MOBILE:  
NOT TESTED

---

## Stop

Phase 14D selesai. Tidak ada deploy. Tidak ada perubahan tambahan.

Cara mengulang Local:

1. `node scripts/bootstrap-local-pb.mjs`
2. Pastikan `.env.local` → `http://127.0.0.1:8090`
3. `npm run dev`
4. `npm run smoke:seed` (HR/Employee); Owner sudah dari bootstrap
5. `node scripts/phase14d-browser-smoke.mjs` (butuh Chrome)

Menunggu Owner review.
