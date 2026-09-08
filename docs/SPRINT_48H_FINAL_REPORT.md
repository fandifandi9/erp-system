# SERBA ERP — Laporan Final Sprint 48 Jam (Soft Launch Internal 9 Juli)

**Tanggal audit:** 7 Juli 2026  
**Target:** Soft launch internal **9 Juli 2026**  
**Scope:** Stabilitas, keamanan, validasi production — **tanpa fitur baru**

---

## Rekomendasi Akhir

### **GO WITH CONDITIONS** untuk soft launch internal 9 Juli

Soft launch internal **boleh dilanjutkan** setelah kondisi wajib di bawah diselesaikan **paling lambat 8 Juli pagi**. Tanpa itu, status berubah menjadi **NO-GO**.

| Kondisi wajib sebelum 9 Juli | Owner | Estimasi |
| --- | --- | --- |
| Restore test backup PB ke instance **staging** + verifikasi R5–R12 | DevOps | 2–3 jam |
| Deploy build terbaru (middleware RBAC aktif di root) | DevOps | 30 menit |
| Manual E2E ERP write: PO→Receiving→Stock, SO→Invoice→Stock | QA + Bisnis | 2 jam |
| Manual E2E WMS: check-in zona packing → sesi packing → selesai | QA Gudang | 1 jam |
| Prosedur unduh backup (403 API → manual PB Admin) didokumentasikan & diuji | DevOps | 30 menit |

**NO-GO** untuk: share link tanpa token ke pelanggan eksternal (sudah diperbaiki di kode — perlu deploy), restore disaster recovery tanpa staging test, production multi-instance WMS foto lokal.

---

## Ringkasan Eksekutif

| Area | Status | Catatan |
| --- | --- | --- |
| P0-1 Restore test | **FAIL** (parsial) | Backup dibuat ✅, unduh 403 ⚠️, restore staging ❌ belum |
| P0-2 Smoke E2E | **PASS** (16/19 otomatis) | 3 WARN = ERP write + packing manual |
| P0-3 Bug fixes | **Selesai** | 1 blocker kritis RBAC diperbaiki |
| P1 RBAC | **PASS** | Middleware + API share 403 |
| P1 Packing + foto | **PASS** (foto) / **WARN** (packing write) | Upload foto ✅; sesi packing perlu check-in manual |
| P1 Share token | **PASS** | URL otomatis `?token=` |

---

## PASS / FAIL per Workflow

### HR — Login → Attendance → Leave → Approval

| Step | Result | Detail |
| --- | --- | --- |
| Login (smoke-hr, smoke-employee) | **PASS** | Auth PB OK |
| Attendance web | **PASS** (redirect) | Absensi hanya app native — redirect dashboard |
| Leave request create | **PASS** | `leave_requests` pending dibuat via sprint E2E |
| Leave HR approval | **PASS** | Status `approved` oleh smoke-hr |
| HR pages (smoke accounts) | **PASS** | `/hr/*` accessible HR only |

### ERP — Purchase Order → Receiving → Stock Update

| Step | Result | Detail |
| --- | --- | --- |
| PO data exists | **PASS** | 11 PO, contoh PO-20260527-556 |
| PO sent to warehouse | **PASS** | 7 PO dengan `send_to_warehouse_at` |
| Receiving page/API | **PASS** | Halaman + detail PO reachable |
| Finalize receiving → stock | **WARN** | Write path **belum diuji otomatis** — wajib manual |
| AP bill from PO | **WARN** | Verifikasi manual |

### ERP — Sales Order → Invoice → Stock Reduction

| Step | Result | Detail |
| --- | --- | --- |
| SO data exists | **PASS** | 53+ SO aktif |
| Invoice exists | **PASS** | 31 invoice |
| SO sent to warehouse | **PASS** | 27 SO |
| Invoice + stock reduction write | **WARN** | Write path **belum diuji otomatis** — wajib manual |

### WMS — Picking → Packing → Pickup → Photo Upload

| Step | Result | Detail |
| --- | --- | --- |
| Picking / validasi / pickup pages | **PASS** | Warehouse staff OK |
| Photo upload (multipart) | **PASS** | `/api/wms/photos` — 1 file tersimpan |
| Packing session API | **PASS** (guard) | Menolak tanpa check-in zona (expected) |
| Packing session E2E write | **WARN** | Perlu check-in zona packing + meja — manual |
| Stock movements data | **PASS** | 46 movements |

### RBAC (P1)

| Test | Result | Detail |
| --- | --- | --- |
| Unauthenticated → `/login` | **PASS** | HTTP 307 |
| Employee denied `/hr/employees` | **PASS** | Redirect `/dashboard-staff` |
| HR allowed `/hr/employees` | **PASS** | HTTP 200 |
| WH denied HR admin | **PASS** | HTTP 307 |
| Share API tanpa token | **PASS** | HTTP 403 |
| Share API dengan token | **PASS** | HTTP 200 tanpa login |

### Share Links (P1)

| Test | Result | Detail |
| --- | --- | --- |
| `POST /api/bisnis/share/ensure-url` | **PASS** | Token dibuat/disimpan |
| WA/email/copy pakai URL `?token=` | **PASS** | `DocumentShareMenu` resolve otomatis |
| Akses publik tanpa token | **PASS** | Ditolak 403 |

### Backup & Restore (P0-1)

| Test | Result | Detail |
| --- | --- | --- |
| Admin PB login | **PASS** | |
| Backup dibuat di server | **PASS** | Key: `pb_backup_acme_20260522111950.zip` |
| Unduh backup zip via API | **WARN** | HTTP 403 — unduh manual PB Admin |
| Integritas data (counts) | **PASS** | Users 23, PO 11, SO 56, dll. |
| Restore ke staging | **FAIL** | Tidak ada instance staging — **belum diuji** |

---

## Bug Ditemukan

| # | Severity | Bug | Dampak |
| --- | --- | --- | --- |
| B1 | **Critical** | `middleware.ts` berada di `app/middleware.ts` — **tidak diload** Next.js 16 (`middleware-manifest.json` kosong) | Semua user bisa akses semua halaman (RBAC mati) |
| B2 | **High** | Cookie sesi tanpa field `role_code` / `inventory_role` lengkap | Middleware RBAC bisa salah klasifikasi role |
| B3 | **High** | Link share WA/email tanpa `?token=` | IDOR — dokumen bisa diakses tanpa otorisasi |
| B4 | **Medium** | Backup download API HTTP 403 | Tidak bisa otomatis unduh backup ke offsite |
| B5 | **Medium** | Restore staging belum pernah diuji | Recovery bencana belum tervalidasi |
| B6 | **Low** | Smoke test menghitung HTTP 200 sebagai “denied OK” | False positive RBAC di CI |
| B7 | **Low** | Packing session 0 record di PB | Workflow belum pernah end-to-end di production data |

---

## Bug Diperbaiki (sesi ini)

| Bug | Perbaikan | File |
| --- | --- | --- |
| B1 | Pindah middleware ke **root** `middleware.ts` | `middleware.ts` (hapus `app/middleware.ts`) |
| B2 | Enrich cookie sesi via `authRefresh` + field RBAC | `app/api/auth/session/route.ts` |
| B3 | API `ensure-url` + auto-resolve token di share menu | `app/api/bisnis/share/ensure-url/route.ts`, `lib/bisnis/doc-share-token.ts`, `components/bisnis/DocumentShareMenu.tsx` |
| B6 | Deny test: 200 = FAIL, hanya 307 redirect | `scripts/smoke-test-workflows.mjs`, `scripts/smoke-test-e2e.mjs` |

Build production: **263 halaman, Middleware aktif** (`ƒ Proxy (Middleware)`).

---

## Bug Masih Tersisa

| Bug | Status | Mitigasi sementara |
| --- | --- | --- |
| B4 Backup download 403 | Open | Unduh manual PB Admin → Settings → Backups |
| B5 Restore staging | Open | Jadwalkan restore test 8 Juli di VM staging |
| ERP write E4/E5 | Open (WARN) | Checklist manual `docs/SMOKE_TEST_CHECKLIST.md` |
| B7 Packing E2E write | Open (WARN) | QA gudang: check-in zona → buat sesi → complete |
| WMS foto di `public/uploads/` | Open | Single-instance OK untuk soft launch; rencanakan S3 post-launch |
| i18n ~75–80% | Deferred | Hardcoded ID di WMS — tidak blocker internal |

---

## Risiko yang Masih Ada

1. **Disaster recovery belum tervalidasi** — restore PB ke staging belum PASS.
2. **ERP write path** — receiving finalize dan invoice→stock hanya terbukti via data existing, bukan transaksi baru hari ini.
3. **Packing workflow** — guard API OK, tetapi alur UI belum sign-off QA.
4. **Backup offsite** — otomatis unduh gagal; ketergantungan manual admin PB.
5. **Deploy production** — middleware fix **wajib** deploy sebelum 9 Juli; versi lama = RBAC mati.
6. **Single server WMS uploads** — restart/hapus folder = foto hilang jika tidak di-backup (`npm run backup:uploads`).

---

## Hasil Automated Test (referensi)

| Suite | PASS | FAIL | WARN |
| --- | --- | --- | --- |
| `npm run sprint:restore` | 11 | 1 | 1 |
| `npm run sprint:e2e` | 16 | 0 | 3 |
| `npm run build` | ✅ | — | deprecation notice middleware→proxy |

Laporan detail:
- [SPRINT_RESTORE_VERIFY.md](./SPRINT_RESTORE_VERIFY.md)
- [SPRINT_E2E_WRITE_TESTS.md](./SPRINT_E2E_WRITE_TESTS.md)
- [WORKFLOW_AUDIT_RESULTS.md](./WORKFLOW_AUDIT_RESULTS.md)
- [SMOKE_TEST_RESULTS.md](./SMOKE_TEST_RESULTS.md)

---

## Perintah Verifikasi

```bash
npm run build                  # pastikan Middleware aktif
npm run sprint:restore         # backup + counts
npm run sprint:e2e             # RBAC, leave, share, foto (perlu app running)
npm run smoke:full             # audit lengkap
```

Akun uji: lihat [SMOKE_TEST_ACCOUNTS.md](./SMOKE_TEST_ACCOUNTS.md) — password `SMOKE_PASSWORD` di `.env.local`.

---

## Sign-off

| Peran | Keputusan | Syarat |
| --- | --- | --- |
| Engineering | **GO WITH CONDITIONS** | Deploy middleware fix + share token |
| QA | **GO WITH CONDITIONS** | Manual ERP + packing 8 Juli |
| DevOps | **NO-GO** (DR) | Restore staging PASS dulu |
| **Soft launch internal 9 Juli** | **GO WITH CONDITIONS** | 4 kondisi wajib di atas |

---

*Ditunda pasca soft launch (sesuai scope): Department/Position/Organization CRUD, Purchase Request, HR QR, Load Testing, Mobile App, i18n 100%.*
