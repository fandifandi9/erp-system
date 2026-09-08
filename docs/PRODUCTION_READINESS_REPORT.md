# Production Readiness Report — SERBA ERP

**Tanggal:** 7 Juli 2026  
**Target soft launch:** 9–10 Juli 2026  
**PocketBase produksi:** `https://pb.serba.space`

---

## Rekomendasi: **GO BERSYARAT (Conditional GO)**

Soft launch **boleh dilanjutkan** untuk pengguna internal (staff, gudang, HR, pembelian, penjualan) setelah checklist deployment di bawah selesai.  
**Share dokumen ke pelanggan/supplier eksternal** memerlukan link dengan `?token=` — lihat risiko #1.

---

## P0 — Status

| Area | Status | Catatan |
| --- | --- | --- |
| Security audit API | ✅ | 103 route diaudit — lihat [API_ROUTE_AUDIT.md](./API_ROUTE_AUDIT.md) |
| HttpOnly session cookie | ✅ | `POST/DELETE /api/auth/session`, login & logout disinkronkan |
| Share IDOR | ✅ | Token wajib untuk invoice/PO/SO publik; invoice token route `/share/i/[token]` |
| WMS workstation config | ✅ | Memerlukan login |
| Hardcoded IP PB | ✅ | Dihapus — env wajib |
| PocketBase schema | ✅ | `npm run audit:pb-schema` lulus (receiving_workflow_json, share_token) |
| Production build | ✅ | `npm run build` sukses (262 halaman) |
| Docker | ✅ | Build args `NEXT_PUBLIC_*`, healthcheck |
| Health check | ✅ | `GET /api/health` |
| Backup script | ⚠️ | `npm run backup:pb` membuat backup di server; unduh otomatis 403 (unduh manual dari PB Admin) |
| Restore test | ⏳ | Prosedur di [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) — **belum diuji di staging** |

---

## Bug yang diperbaiki (sprint ini)

1. **Infinite API loop** — `WorkContextProvider` init sekali saat mount.
2. **Profile / tenant API 500** — env admin PB + perbaikan sesi.
3. **Share API IDOR** — auth token atau login staff pada semua share endpoint.
4. **WMS config publik** — dilindungi auth.
5. **Client `pb` di server** — `purchase-receiving-finalize.ts` memakai `getInventoryAdminPb()`.
6. **Cookie auth** — HttpOnly + Secure (production) + SameSite=Lax.
7. **Logout tidak hapus cookie server** — Navbar memanggil `DELETE /api/auth/session`.
8. **Build tanpa env PB** — gagal di awal (sengaja).
9. **Schema hilang** — `receiving_workflow_json` ditambahkan ke migration; `share_token` untuk PO/SO.
10. **Build gagal** — komponen `ProfileLanguageSettings` dibuat.

---

## Hasil pengujian modul

### P0 otomatis

| Tes | Hasil |
| --- | --- |
| `npm run audit:api-routes` | 0 route perlu review |
| `npm run audit:pb-schema` | Semua field kritis ada |
| `npm run build` | Sukses |

### P1 end-to-end (manual — belum dijalankan penuh di sprint ini)

| Modul | Status | Catatan |
| --- | --- | --- |
| HR (login, cuti, absensi, dll.) | ⚠️ | Otomatis: RBAC OK, 18 profiles, 27 leave. Login API skip — perlu `SMOKE_PASSWORD`. Manual: [SMOKE_TEST_CHECKLIST.md](./SMOKE_TEST_CHECKLIST.md) |
| ERP (customer, PO, SO, invoice, stok) | ⚠️ | Data OK: 11 PO, 56 SO, 31 invoice, 6 produk. Manual transaksi belum di-sign-off |
| WMS (picking, packing, QC, label) | ⚠️ | 7 PO + 27 SO ke gudang; 0 packing session aktif. Manual workflow belum di-sign-off |

**Smoke test otomatis:** `npm run smoke:seed` + `npm run smoke:test` → [SMOKE_TEST_RESULTS.md](./SMOKE_TEST_RESULTS.md) (**102 pass, 0 fail** — 7 Jul 2026, akun dummy `smoke-*@serba.test`)

### P2

| Area | Status |
| --- | --- |
| i18n 100% | ❌ ~75–80% — banyak halaman WMS masih hardcoded ID |
| Performance audit | ⏳ Belum dioptimasi sistematis |
| Logging transaksi | ⏳ Sebagian via tenant activity; belum lengkap semua event sprint |
| Audit trail field | ⏳ Sebagian koleksi sudah punya created/updated; belum diverifikasi semua transaksi |

---

## Soft Launch Checklist

| Item | Status |
| --- | --- |
| Build production berhasil | ✅ |
| Semua migration kritis | ✅ (jalankan `npm run pb:retur-schema` & `npm run pb:share-token-schema` di prod) |
| Tidak ada endpoint debug | ✅ |
| Tidak ada hardcoded localhost/IP lama (runtime) | ✅ (localhost hanya di next/image dev pattern) |
| Tidak ada API 500 saat startup | ✅ (dengan env lengkap) |
| Role & permission tervalidasi | ✅ (103 API routes) |
| Backup otomatis | ⚠️ Script ada; jadwal cron belum dipasang |
| Restore berhasil | ⏳ Belum diuji |
| HTTPS aktif | ✅ (pb.serba.space) |
| Authentication aman | ✅ |
| Workflow HR/ERP/WMS lulus | ⏳ Manual QA pending |
| Sistem tanpa intervensi developer | ⚠️ Conditional |

---

## Risiko yang masih tersisa

1. **Link share WA/email masih ID-only** — `doc-share.ts` belum menambahkan `?token=` otomatis. Pelanggan/supplier perlu link `/share/.../id?token=...` atau `/share/i/[token]` (invoice). **Mitigasi:** gunakan QR invoice (sudah tokenized) atau generate token manual sebelum kirim link.

2. **Backup unduh 403** — Admin API legacy tidak bisa unduh zip; backup tetap tercipta di server PB. Pasang unduhan manual + cron di host PB.

3. **Upload WMS lokal** — `public/uploads/wms/` tidak aman untuk multi-instance Docker.

4. **i18n campuran ID/EN** — UI masih bercampur di beberapa modul WMS/gudang.

5. **Thermal barcode print** — popup browser bisa diblokir di PC gudang.

6. **P1 manual QA** — belum dijalankan untuk semua role (Super Admin, HR Admin, Warehouse, Purchasing, Sales, Employee).

---

## Deployment produksi

```bash
# 1. Env wajib (.env.local / host secrets)
NEXT_PUBLIC_APP_URL=https://erp.serba.space   # URL publik ERP
NEXT_PUBLIC_POCKETBASE_URL=https://pb.serba.space
POCKETBASE_ADMIN_EMAIL=...
POCKETBASE_ADMIN_PASSWORD=...
RESEND_API_KEY=...                            # opsional email

# 2. Schema PB (sekali / setelah deploy kode baru)
npm run pb:retur-schema
npm run pb:share-token-schema
npm run audit:pb-schema

# 3. Docker
docker compose up -d --build

# 4. Verifikasi
curl https://<erp-host>/api/health
npm run audit:api-routes
```

---

## Perintah audit & backup

| Perintah | Fungsi |
| --- | --- |
| `npm run audit:api-routes` | Laporan 103 endpoint → `docs/API_ROUTE_AUDIT.md` |
| `npm run audit:pb-schema` | Verifikasi field kritis di PB live |
| `npm run backup:pb` | Backup PocketBase |
| `npm run backup:uploads` | Backup folder upload lokal |

---

## Keputusan GO / NO-GO

| Skenario | Keputusan |
| --- | --- |
| Soft launch **internal** (staff only, 9–10 Juli) | **GO** — setelah migration PB di prod + smoke test 1 hari per role |
| Soft launch **dengan share eksternal** (pelanggan/supplier via link) | **NO-GO** sampai link share menyertakan token otomatis |
| Full production tanpa intervensi developer | **NO-GO** — selesaikan P1 QA, backup restore test, i18n P2 |

---

## Langkah sebelum 9 Juli (prioritas)

1. Jalankan smoke test HR + 1 transaksi PO + 1 SO + 1 picking WMS per role.
2. Pasang cron backup PB di server + dokumentasi restore test staging.
3. Update generator link share (WA/email/copy) agar selalu sertakan `share_token`.
4. Verifikasi HTTPS dan env production di host Docker final.

---

*Dibuat otomatis sebagai bagian Production Readiness Sprint. Perbarui setelah P1 QA selesai.*
