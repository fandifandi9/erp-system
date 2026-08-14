# Handoff — Lanjut besok (disimpan 2026-08-14 17:39 WIB)

**STOP di sini.** Production **belum** di-deploy. Tunggu Owner UAT + approval.

Jangan `git add -A`. Working tree masih penuh WIP paralel (bisnis/retur/WMS). Commit selektif saja jika diminta.

---

## Status 14 Agu 2026

### Staging Next — blank page / chunk 404 (SUDAH DIPERBAIKI di VPS)

Gejala: `https://staging.serba.space` putih, `/hr` macet di **Memverifikasi akses...**, console 404 `/_next/static/chunks/*.js`, CSS MIME `text/plain`.

Penyebab: PM2 `erp-system-staging` menjalankan `.next/standalone/server.js` (`chdir` ke standalone). Folder `.next/standalone/.next/static` **kosong** setelah build. HTML 200, aset 404.

Perbaikan staging only:
1. `cp -a /var/www/erp-staging/.next/static /var/www/erp-staging/.next/standalone/.next/static`
2. `pm2 restart erp-system-staging` **tanpa** `--update-env`
3. Verifikasi: JS `200 application/javascript`, CSS `200 text/css`

Production `erp-system` / `pb-erp` **tidak disentuh** (17D, 0 restarts saat recovery).

Setelah overlay/build staging berikutnya, **wajib** salin `.next/static` ke standalone lagi, lalu restart staging saja.

### CRLF `.env.local` staging (sebelumnya hari ini)

`HOSTNAME=127.0.0.1\r` membuat proses **errored** → 502. File `/var/www/erp-staging/.env.local` sudah di-strip CR. Jangan `pm2 restart --update-env` kecuali shell env sudah bersih (HOSTNAME/PORT tanpa `\r`).

### Hub HR — kartu penjualan/pajak (LOKAL saja, belum overlay staging)

Akun Fandi HR **tidak** butuh penjualan, pajak, POS, toko, dll. Itu Owner.

Sidebar sudah benar (`LAPORAN_NAV_ITEMS_HR` / `PENGATURAN_NAV_ITEMS_HR`). Yang bocor: halaman indeks memakai katalog Owner.

Kode lokal (belum di staging overlay):
- `lib/module/role-hub.ts`
- `app/(dashboard)/laporan/page.tsx`
- `app/(dashboard)/pengaturan/page.tsx`
- Label sidebar `/laporan/sdm` → **Laporan SDM** (`lib/wms/navigation.ts`, `lib/i18n/nav-catalog.ts`)
- Subtitle HR: `lib/i18n/messages/hubs-id.ts` + `hubs-en.ts`

Cek di **localhost** (`npm run dev`), login HR:
- `/laporan` → hanya Laporan SDM
- `/pengaturan` → Peran & Izin + Notifikasi

Staging `staging.serba.space` **masih** menampilkan kartu Owner di hub sampai overlay + rebuild + copy static.

### Peran & Izin — path `/hr/reports` dobel (LOKAL)

`DEFAULT_USER_ACCESS` sudah berisi `/hr/reports`, lalu Manager/Staff menambahkannya lagi → React `same key`.

Perbaikan: `uniquePaths()` di `lib/rbac.ts`; key chip di `app/(dashboard)/pengaturan/role/page.tsx`.

### 503 `/api/hr/rating/periods` di localhost — BUKAN BUG

`npm run dev` mengarah ke PocketBase **production** (`pb.serba.space`). Koleksi Rating **hanya di staging PB**. API sengaja 503.

Rating / Laporan-Temuan: uji di `https://staging.serba.space` atau `npm run staging:next-dev`. Jangan uji Rating lewat dev yang ke production PB.

### Phase 13 — Laporan & Temuan

Kode lokal ada (API + web + mobile + unit test). Schema staging script: `npm run pb:hr-reporting-schema:staging` — **belum** di-apply ke VPS (blocked / belum dijalankan Owner). Live API **NOT TESTED**. **NO-GO production.**

Laporan: `docs/PHASE_13_REPORTING_FINDINGS_UAT.md`

### Phase 12E mobile

Laporan: `docs/PHASE_12E_MOBILE_STABILIZATION_REPORT.md` — device UAT **NOT TESTED**, **MOBILE NO-GO**.

---

## Keputusan yang sudah locked

| Item | Keputusan |
| --- | --- |
| Rating model | 1 subject → many reviewers |
| Smart Random | D1=A: company + (dept OR div OR office). **Bukan** company-only |
| Eligible &lt; requested | 400 + warning, **tidak** diam-diam kurangi |
| Privacy | Subject: agregat saja. HR/Owner: identitas + raw |
| Attendance | GPS only, no QR, offline OFF |
| Leave production | write-lock `fad420b7` **jangan diubah** |
| Deploy source | controlled overlay, **bukan** dirty tree |
| HR hub | HR tidak melihat penjualan/pajak/POS; Owner tetap katalog penuh |

---

## Staging hidup (cek cepat)

```powershell
curl.exe -sI https://staging.serba.space/login
curl.exe -sI https://staging.serba.space/_next/static/chunks/0dypt857u7dp7.js
curl.exe -sI https://pb-staging.serba.space/api/health
curl.exe -sI https://serba.space/login
```

Chunk JS harus **200** + `application/javascript`. Kalau 404 `text/plain` lagi: static belum ada di standalone.

UAT URL: **https://staging.serba.space**  
Next staging: `127.0.0.1:3002` (PM2 `erp-system-staging`)  
PB staging: `127.0.0.1:8092` via **https://pb-staging.serba.space**  
VPS: `root@72.62.194.224`  
Jangan sentuh port **3001** (shop), production `:3000` / `:8091`.

Smoke login staging: `smoke-hr@serba.test` (password di `.env.local` `SMOKE_PASSWORD`).  
Admin staging: `.env.staging.local` `POCKETBASE_STAGING_ADMIN_*` (bukan production).

---

## Exact next step besok

1. Overlay **hanya** file hub HR ke staging (bukan dirty tree), `npm run build` di `/var/www/erp-staging`, **copy** `.next/static` → `.next/standalone/.next/static`, restart **hanya** `erp-system-staging` tanpa `--update-env` kecuali env sudah CR-stripped.
2. UAT Fandi HR di staging: `/laporan` dan `/pengaturan` hanya kartu SDM; Owner tetap lihat penjualan.
3. Owner UAT Rating di staging (`docs/PHASE_12B_RATING_MODULE_REPORT.md`).
4. Phase 13: apply schema staging **hanya jika** Owner minta, lalu `npm run test:hr-reporting-api-staging`. Jangan production.
5. Jangan `git add -A`. Jangan `git reset --hard`.

---

## Jangan dilakukan tanpa approval

- Production deploy Rating / Attendance / Phase 13
- Ubah production PB `:8091` / `pb_data` / `pb-erp` / `/var/www/erp`
- Ubah leave write-lock production
- DNS/Nginx production (`serba.space`, `pb.serba.space`)
- `git reset --hard` / `git clean` (WIP paralel)
- Company-only Smart Random (bertentangan D1=A)
- `pm2 restart erp-system` / `pb-erp`

---

## File hari ini (belum commit ke git — masih campur WIP)

### Hub HR
- `lib/module/role-hub.ts` (baru)
- `app/(dashboard)/laporan/page.tsx`
- `app/(dashboard)/pengaturan/page.tsx`
- `lib/wms/navigation.ts` (`LAPORAN_NAV_ITEMS_HR` label)
- `lib/i18n/nav-catalog.ts`
- `lib/i18n/messages/hubs-id.ts` / `hubs-en.ts`
- `lib/rbac.ts` (`uniquePaths`)
- `app/(dashboard)/pengaturan/role/page.tsx`

### VPS staging (sudah applied, bukan git)
- `/var/www/erp-staging/.next/standalone/.next/static` (copy dari `.next/static`)
- `/var/www/erp-staging/.env.local` (CR stripped)

---

## Known blockers

- Hub HR filter **belum** di staging overlay
- Phase 13 schema **belum** di VPS
- Local `tsc`/`build` bisa gagal karena WIP **bisnis/retur**
- Dirty working tree ratusan path — jangan dipakai sebagai source deploy penuh
- Rating 503 di `localhost:3000` = expected (PB production)

---

**Handoff siap.** Besok mulai dari overlay hub HR ke staging (copy static + restart staging only) lalu UAT Fandi HR di `/laporan` dan `/pengaturan`.
