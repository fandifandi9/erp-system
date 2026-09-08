# Laporan Audit Production Readiness — SERBA ERP

**Tanggal audit:** 7 Juli 2026  
**Target soft launch:** 9–10 Juli 2026  
**Environment:** `https://pb.serba.space` + dev app `http://localhost:3000`  
**Auditor:** Production Readiness Sprint (otomatis + smoke accounts)

---

## Keputusan GO / NO-GO

| Skenario | Keputusan | Alasan singkat |
| --- | --- | --- |
| **Soft launch internal (staff, gudang, HR)** | **GO** | 151 pass otomatis, 0 fail, API & schema aman |
| **Soft launch dengan pelanggan/supplier (link share)** | **GO BERSYARAT** | Share wajib pakai `?token=` atau `/share/i/[token]` |
| **Full production tanpa intervensi developer** | **GO BERSYARAT** | 7 item warn perlu verifikasi manual (lihat bawah) |

---

## Ringkasan eksekusi audit

| Lapisan | Perintah | Pass | Fail | Warn | Skip |
| --- | --- | ---: | ---: | ---: | ---: |
| RBAC + data + API | `npm run smoke:test` | 102 | 0 | 0 | 6 |
| Workflow HR/ERP/WMS | `npm run smoke:workflows` | 52 | 0 | 8 | 2 |
| API security (103 route) | `npm run audit:api-routes` | 101 protected | 0 review | — | 2 public |
| PocketBase schema | `npm run audit:pb-schema` | ✅ lulus | — | — | — |
| Production build | `npm run build` | ✅ 262 halaman | — | — | — |

**Total otomatis:** **154 PASS · 0 FAIL**

---

## Akun dummy untuk QA

Password semua: **`SerbaSmoke2026!`** (lihat `.env.local` → `SMOKE_PASSWORD`)

| Role | Email |
| --- | --- |
| HR Admin | `smoke-hr@serba.test` |
| Employee | `smoke-employee@serba.test` |
| Warehouse Staff | `smoke-warehouse@serba.test` |
| Supervisor | `smoke-supervisor@serba.test` |
| Admin Bisnis | `smoke-admin-bisnis@serba.test` |

Detail: [SMOKE_TEST_ACCOUNTS.md](./SMOKE_TEST_ACCOUNTS.md)

Perintah audit ulang:

```bash
npm run dev          # terminal 1
npm run smoke:full   # seed + smoke + workflow + API + schema
```

---

## P0 — Security Audit

| Item | Status | Bukti |
| --- | --- | --- |
| 103 API route diaudit | ✅ | [API_ROUTE_AUDIT.md](./API_ROUTE_AUDIT.md) — 0 route perlu review |
| Share IDOR | ✅ | `SEC1`: share tanpa token → **403** |
| HttpOnly session cookie | ✅ | `POST/DELETE /api/auth/session`, logout Navbar |
| WMS config auth | ✅ | `requireInventoryAccess` |
| Hardcoded IP PB | ✅ | Dihapus — env wajib |
| Debug endpoints | ✅ | 0 flagged |
| Cookie auth | ✅ | HttpOnly + Secure (prod) + SameSite=Lax |

---

## P0 — PocketBase & Environment

| Item | Status |
| --- | --- |
| `receiving_workflow_json` | ✅ |
| `share_token` (invoice, PO, SO) | ✅ |
| `users.locale`, `web_access` | ✅ |
| `npm run audit:pb-schema` | ✅ lulus |
| `NEXT_PUBLIC_POCKETBASE_URL` | ✅ `https://pb.serba.space` |
| Production build | ✅ |

---

## P1 — Hasil uji modul (otomatis)

### HR Module — **PASS**

| ID | Flow | Hasil |
| --- | --- | --- |
| H1 | Login → `/hr` | ✅ |
| H2 | Logout session API | ✅ |
| H3 | Forgot password API | ✅ |
| H4 | Employees page | ✅ |
| H7 | Attendance (5 record) | ✅ |
| H8 | Offices GPS (2 kantor) | ✅ |
| H9 | Leave (9 pending) | ✅ |
| H10 | Overtime page | ✅ |
| H11–H14 | Profile, locale EN, activity, role settings | ✅ |
| H5–H6 | Department/Position | ⏭️ Field di `profiles`, bukan koleksi terpisah |

Detail: [WORKFLOW_AUDIT_RESULTS.md](./WORKFLOW_AUDIT_RESULTS.md)

### ERP Module — **PASS** (2 warn manual)

| ID | Flow | Hasil |
| --- | --- | --- |
| E1–E5 | Customer, supplier, produk, kategori, PO list | ✅ |
| E9–E12 | SO list, stock, catalog API, couriers API | ✅ |
| E5b | 11 PO aktif | ✅ |
| E6 | 7 PO ke gudang | ✅ |
| E9b | 53 SO aktif | ✅ |
| E10 | 27 SO ke gudang | ✅ |
| E11 | 31 invoice | ✅ |
| E7 | Finalize receiving (exception flow) | ⚠️ Manual |
| E8 | AP bill dari PO | ⚠️ Manual |
| E13 | WH akses halaman penjualan | ⚠️ RBAC mengizinkan (inventory overlay) |
| E14 | WH API couriers | ⚠️ Staff inventory dapat akses API |

### WMS Module — **PASS** (3 warn manual)

| ID | Flow | Hasil |
| --- | --- | --- |
| W1 | Receiving list | ✅ |
| W1b | Detail PO `PO-20260530-0001` | ✅ |
| W2 | `receiving_workflow_json` | ✅ |
| W3–W5, W7–W8, W11 | Putaway, picking, validasi, pickup, label, audit | ✅ |
| W10 | 46 stock movements | ✅ |
| W10b | Workstation API | ✅ |
| W12–W13 | Opname + ERP core (supervisor) | ✅ |
| W6 | Packing session aktif | ⚠️ 0 session |
| W9 | Photo upload | ⚠️ Manual multipart |
| W12b | Opname API | ⚠️ Perlu session opname |

---

## P0 — Deployment & Backup

| Item | Status |
| --- | --- |
| Docker build args `NEXT_PUBLIC_*` | ✅ |
| Health check `/api/health` | ✅ |
| Backup script `npm run backup:pb` | ⚠️ Backup dibuat di server; unduh zip 403 — manual dari PB Admin |
| Restore test staging | ⏳ Belum diuji |
| Prosedur | [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) |

---

## Bug yang diperbaiki selama sprint

1. Infinite API loop (`WorkContextProvider`)
2. Share API IDOR → token + login staff
3. HttpOnly cookie + logout sync
4. Client `pb` di server → admin PB
5. Hardcoded IP fallback dihapus
6. Schema `receiving_workflow_json`, `share_token` PO/SO
7. Docker/env production hardening
8. Build gagal (`ProfileLanguageSettings` missing)
9. Smoke test infrastructure + akun dummy

---

## Risiko tersisa (prioritas)

| # | Risiko | Severity | Mitigasi |
| --- | --- | --- | --- |
| 1 | Link share WA/email belum auto-token | Medium | Pakai `/share/i/[token]` atau `?token=` |
| 2 | Backup unduh otomatis 403 | Medium | Cron PB Admin + unduh manual |
| 3 | WMS photo lokal (`public/uploads/`) | Medium | Single-instance atau shared volume |
| 4 | i18n ~75–80% (WMS hardcoded ID) | Low | P2 post-launch |
| 5 | WH staff bisa buka `/bisnis/penjualan` | Low | Review `InventoryGate` jika harus deny |
| 6 | Packing/photo/opname belum diuji write | Low | 30 menit manual pre-launch |
| 7 | Restore PB belum diuji | Medium | Test di staging 8 Juli |

---

## Soft Launch Checklist — status final

| Item | Status |
| --- | --- |
| Build production berhasil | ✅ |
| Migration PB kritis | ✅ |
| Tidak ada API 500 saat smoke | ✅ |
| Tidak ada endpoint debug | ✅ |
| Tidak ada hardcoded IP lama | ✅ |
| Role & permission tervalidasi | ✅ |
| HR workflow (read + auth) | ✅ |
| ERP workflow (read + data) | ✅ |
| WMS workflow (read + receiving detail) | ✅ |
| Backup script | ⚠️ |
| Restore test | ⏳ |
| HTTPS | ✅ (PB) |
| Authentication aman | ✅ |
| Sistem tanpa developer | ⚠️ Conditional |

---

## Rekomendasi timeline 8–9 Juli

**8 Juli (hari ini):**
- [ ] Manual 30 menit: packing 1 SO, upload 1 foto WMS, approve 1 cuti pending
- [ ] Restore test backup PB di staging
- [ ] Pasang cron backup di server PB

**9 Juli (soft launch):**
- [ ] Deploy Docker production dengan env final
- [ ] Smoke `npm run smoke:full` di production URL
- [ ] GO internal — monitor error console + `/api/health`

---

## Lampiran dokumen

| Dokumen | Isi |
| --- | --- |
| [PRODUCTION_READINESS_REPORT.md](./PRODUCTION_READINESS_REPORT.md) | Sprint P0 original |
| [SMOKE_TEST_RESULTS.md](./SMOKE_TEST_RESULTS.md) | RBAC + API per role |
| [WORKFLOW_AUDIT_RESULTS.md](./WORKFLOW_AUDIT_RESULTS.md) | Checklist H/E/W |
| [API_ROUTE_AUDIT.md](./API_ROUTE_AUDIT.md) | 103 endpoint |
| [SMOKE_TEST_CHECKLIST.md](./SMOKE_TEST_CHECKLIST.md) | Manual reference |
| [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) | Backup/restore |

---

*Audit dihasilkan otomatis. Verdict: **GO untuk soft launch internal 9–10 Juli** dengan mitigasi risiko di atas.*
