# Navigation & Settings Audit

**Mode:** Audit only. Tidak ada perubahan code, UI, RBAC, schema, migration, atau deploy.  
**Sumber:** working tree Local `B:\Coding\erp-system` (bukan asumsi staging overlay).  
**Tanggal:** 2026-08-23  
**Production:** UNTOUCHED (tidak di-deploy, tidak di-restart, tidak di-mutasi).

Istilah **Penggajian** dipertahankan (bukan “Pengajian”). Nama menu tidak diubah pada phase ini.

---

## 1. Executive Summary

SERBA memisahkan tiga area navigasi yang sering tertukar:

| Area | Fungsi | Siapa yang melihat (sidebar) |
| --- | --- | --- |
| **SDM** | Operasional HR (`/staff/*` → redirect ke `/hr/*`) | Owner (via `canAccess("/hr")`) dan HR |
| **Laporan** | Hub laporan + (untuk SDM) ringkasan angka + shortcut | Owner/operasional: katalog penuh. HR: indeks + Laporan SDM |
| **Pengaturan** | Master data perusahaan + subset sistem | Owner/operasional: katalog penuh. HR (source Local): peran + notifikasi |

**Temuan utama (tanpa perbaikan):**

1. Sidebar HR **sudah** memakai `LAPORAN_NAV_ITEMS_HR` / `PENGATURAN_NAV_ITEMS_HR`. Hub Local (`lib/module/role-hub.ts`) ikut memfilter. Staging overlay **mungkin masih** menampilkan kartu Owner di `/laporan` dan `/pengaturan` jika overlay hub belum di-deploy — itu leak tampilan, bukan izin API penjualan.
2. Middleware menolak path bisnis (`/bisnis/pajak`, `/bisnis/store`, …) untuk HR → redirect ke `/hr`. Kartu yang bocor **tidak** membuka modul sungguhan.
3. **Laporan SDM** adalah dashboard angka + tautan ke halaman operasional SDM. Bukan duplikat modul SDM, tetapi **bukan** laporan analitik mandiri (sebagian overlap navigasi).
4. **Laporan & Temuan** (`/hr/reports`) ada di menu SDM, bukan di grup Laporan. Temuan HR (`/hr/findings`) ada di code + mobile, **tidak** di sidebar SDM.
5. Indeks Pengaturan **tidak** mem-prefetch POS/Pajak/Marketplace. Request berat terjadi **setelah** user membuka halaman tersebut, atau dari layout global (`/api/tenant/work-context`, `/api/tenant/company-access`).
6. Rating di `localhost` → PocketBase production: **503 expected** (koleksi `hr_rating_*` hanya di staging PB).
7. Tidak ada role code `admin` atau `warehouse`. Gudang = Owner + `canAccessInventory`. “Admin” di UI biasanya Owner.

**Keputusan arsitektur tidak diambil di dokumen ini.** Item yang butuh Owner ada di §12 dan §14.E.

---

## 2. SDM Navigation Audit

### Pola rute

Sidebar memakai prefix `/staff/*`. Hampir semua item adalah **redirect klien** ke `/hr/*`.  
Default login HR: `/hr` (dashboard statistik), bukan `/staff` (indeks kartu).

Prefix sidebar SDM: `/staff` dan `/hr` (`SDM_PATH_PREFIXES`).

Akses role: `canAccess(user, "/hr")` → Owner (`*`) dan `role_code=hr`. Manager/staff/security/ob **tidak** mendapat seksi SDM di sidebar.

---

| Nama menu | Route sidebar | Page file | Target / implementasi | API / client | Collection PB | Role | Backend | UI | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Indeks SDM | `/staff` | `app/(dashboard)/staff/page.tsx` | Hub kartu `SDM_NAV_ITEMS` (tanpa fetch modul) | Tidak ada (tautan saja) | — | Owner, HR | n/a | Ya | **READY** (navigasi) |
| Dasbor HR (bukan item sidebar terpisah) | `/hr` | `app/(dashboard)/hr/page.tsx` | Statistik + shortcut rating | PocketBase langsung + `/api/hr/rating/dashboard` | `attendance_logs`, `leave_requests`, `offices`, `users`; rating via API | Owner, HR | Ya (PB); rating API ada | Ya | **PARTIAL** — stats READY; rating 503 jika PB tanpa schema Rating |
| Karyawan | `/staff/karyawan` | `staff/karyawan/page.tsx` → redirect | `/hr/employees` (+ `/new`, `/[id]`, `/incomplete`) | PocketBase langsung | `users`, `profiles`, `offices` | Owner, HR | Ya | Ya | **READY** |
| Absensi | `/staff/absensi` | redirect | `/hr/attendance` | PB + `POST /api/hr/attendance/[id]/correct` | `attendance_logs`, `users` | Owner, HR | Ya | Ya | **READY** |
| Jadwal | `/staff/jadwal` | redirect | `/hr/work-calendar` | PocketBase langsung | `work_calendar_settings`, `office_holidays` | Owner, HR | Ya | Ya | **READY** |
| Cuti | `/staff/cuti` | redirect | `/hr/leave` | PB langsung; API Next juga ada (`/api/hr/leave/*`) untuk alur lain | `leave_requests` | Owner, HR | Ya | Ya | **READY** (web list PB; API Next untuk approve/reject/mobile) |
| Lembur | `/staff/lembur` | redirect | `/hr/overtime` | PocketBase langsung | `overtime_requests`, `users` | Owner, HR | Ya | Ya | **READY** |
| Aktivitas Lapangan | `/staff/lapangan` | redirect | `/hr/field-activity` | PocketBase / `lib/field_activity` | `field_activity_requests` | Owner, HR | Ya | Ya | **READY** |
| Aktivitas Mencurigakan | `/staff/mencurigakan` | redirect | `/hr/attendance/suspicious` | PocketBase (attendance filter `is_suspicious`) | `attendance_logs` | Owner, HR | Ya | Ya | **READY** |
| Pengaturan GPS | `/staff/gps` | redirect | `/hr/offices` | PocketBase langsung | `offices` | Owner, HR | Ya | Ya | **READY** — ini master **kantor/geofence**, bukan “GPS app setting” terpisah |
| Penggajian | `/staff/payroll` | redirect | `/hr/payroll` | `lib/payroll` (PB) | `payroll_settings`, `payroll_periods`, `payroll_items`, plus leave/attendance/overtime/field/profiles | Owner, HR | Ya | Ya | **READY** (bergantung schema payroll di PB yang dipakai) |
| Penilaian / Rating | `/hr/rating` | `hr/rating/page.tsx` + subrute | Dashboard, periods, assignments, results, tasks, my-result | `/api/hr/rating/*` | `hr_rating_periods`, `hr_rating_aspects`, `hr_rating_assignments`, `hr_rating_reviewers`, `hr_rating_scores`, `hr_rating_results` | Owner, HR (tugas/hasil: user terautentikasi sesuai API) | API ada di source | Ya | **PARTIAL** — UI+API Local/staging; **ERROR/503** jika PB = production (koleksi belum ada) |
| Laporan & Temuan | `/hr/reports` | `hr/reports/page.tsx` | `ReportingListPage` kind=report | `/api/hr/reports/*` | `hr_staff_reports`, `hr_case_attachments` | Semua role dengan `/hr/reports` di `DEFAULT_USER_ACCESS` (HR/Owner + manager/staff/security/ob untuk **laporan sendiri**) | API ada di source | Ya | **PARTIAL** — schema staging script ada, **belum** dijamin applied di semua PB; 503 jika koleksi hilang |

### Ada di code, tidak di sidebar SDM

| Nama | Route | Status | Catatan |
| --- | --- | --- | --- |
| Temuan HR | `/hr/findings` | UI + API source | HR/Owner via `ROLE_ACCESS` `/hr/findings`. Mobile tile “Temuan HR”. Sidebar web **tidak** menampilkan item terpisah (hanya “Laporan & Temuan” → reports). |
| Pengaturan kompensasi | `/hr/compensation/settings` | UI + PB | Tidak di `SDM_NAV_ITEMS`. Diizinkan HR di RBAC. |
| Pengaturan kuota cuti | `/hr/leave/settings` | UI + PB `division_quotas` | Tidak di sidebar SDM. |
| Profil HR (halaman lama) | `/hr/profile` | Ada di RBAC | Bukan item sidebar. |

### Catatan redirect `/staff/*`

File `staff/*/page.tsx` memakai `"use client"` + `redirect()` dari `next/navigation`. Perilaku: user yang mengklik menu SDM mendarat di `/hr/...`. Dua URL untuk satu modul — **KEEP** sampai Owner memutuskan kanonik `/staff` vs `/hr`.

---

## 3. Laporan Navigation Audit

### 3.1 Apakah “Laporan SDM” duplikat SDM?

**Kesimpulan fungsi:** dimaksudkan sebagai **reporting/analytics hub** (angka hari ini + daftar laporan), bukan CRUD operasional.

**Bukti:** `app/(dashboard)/laporan/sdm/page.tsx` menghitung `totalItems` dari `attendance_logs`, `leave_requests`, `users`, lalu menampilkan kartu yang **href-nya ke halaman operasional** (`/hr/attendance`, `/hr/leave`, `/hr/payroll`, …).

| Pertanyaan | Jawaban |
| --- | --- |
| Beda fungsi dengan SDM? | **Sebagian.** Angka ringkasan = laporan. Kartu = pintasan ke modul operasional yang sama. |
| Duplikasi penuh? | **Tidak.** Tidak ada form absensi/cuti di halaman ini. |
| Overlap navigasi? | **Ya.** User bisa membuka absensi dari SDM **dan** dari Laporan SDM. |
| Status duplikasi | **PASS — bukan duplikasi modul.** Overlap pintasan = **NEEDS DECISION** jika Owner ingin laporan murni (export/periode) tanpa meniru menu SDM. |

---

| Nama | Route | Page | API / PB | Collection | Role (RBAC path) | Status | Error diketahui |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Indeks Laporan | `/laporan` | `laporan/page.tsx` | Tidak (kartu saja). Local: `selectLaporanNavItems` | — | Owner `*`; HR `/laporan` | **READY** (hub). Staging tanpa overlay: HR bisa **melihat** kartu bisnis (leak UI) | Chunk 404 historis staging (aset standalone) — ops, bukan logic laporan |
| Laporan SDM | `/laporan/sdm` | `laporan/sdm/page.tsx` | PocketBase langsung | `attendance_logs`, `leave_requests`, `users` | Owner; HR `/laporan/sdm` | **PARTIAL** — ringkasan READY; bukan paket laporan analitik | PB 404 jika koleksi/aturan list gagal; ChunkLoadError pernah di staging |
| Laporan & Temuan | `/hr/reports` | di grup **SDM**, bukan grup Laporan | `/api/hr/reports` | `hr_staff_reports`, `hr_case_attachments` | Lihat §2 | **PARTIAL** | 503 jika schema reporting belum di PB |
| Temuan | `/hr/findings` | tidak di `LAPORAN_NAV_ITEMS` | `/api/hr/findings` | `hr_findings` | HR/Owner | **PARTIAL** | sama |
| Penjualan | `/bisnis/laporan-penjualan` | page bisnis | client bisnis | penjualan/invoice related | Owner / inventory | **READY** (di luar SDM) | HR: **403/redirect** jika URL diketik |
| Pembelian | `/bisnis/laporan-pembelian` | page bisnis | client bisnis | pembelian | Owner / inventory | **READY** | HR: redirect |
| Keuangan (Laba Rugi) | `/bisnis/laba-rugi` | page bisnis | client bisnis | — | Owner / inventory | **READY** | HR: redirect |
| Inventaris | `/laporan/inventory` | `laporan/inventory/page.tsx` | PB | inventory balances | Owner / inventory | **READY** | HR: tidak di allow-list |
| Gudang | `/laporan/gudang` | `laporan/gudang/page.tsx` | PB | staff activities inventory | Owner / inventory | **READY** | HR: tidak di allow-list |
| Marketplace | `/laporan/marketplace` | `laporan/marketplace/page.tsx` | PB | `biz_sales_import_batches` | Owner / inventory | **READY** | HR: tidak di allow-list |
| Impor Penjualan MP (kartu ekstra Owner) | `/bisnis/penjualan/import` | hanya di hub Owner | — | — | Owner | **READY** sebagai pintasan | HR Local: disembunyikan (`showLaporanImportMp`) |

Label i18n `/laporan/sdm`: **Laporan SDM** (Local). Overlay staging lama bisa masih berlabel “SDM”.

---

## 4. Pengaturan Audit

### 4.1 Apa yang terlihat

**Sidebar HR:** Indeks Pengaturan, Role & Permission, Notifikasi (`PENGATURAN_NAV_ITEMS_HR`).

**Sidebar Owner / `canBisnis`:** `PENGATURAN_NAV_ITEMS` lengkap.

**Hub `/pengaturan` (Local):**  
- HR: kartu dari `PENGATURAN_NAV_ITEMS_HR` (tanpa indeks) → Peran & Izin + Notifikasi.  
- Non-HR: katalog Owner + sisipan **Konteks Kerja** + **Akses Entitas** (Akses Entitas juga sudah ada di `PENGATURAN_NAV_ITEMS` → risiko kartu dobel untuk Owner).

**Staging tanpa overlay hub:** HR yang membuka Indeks bisa melihat kartu Toko/POS/Pajak (leak UI). Klik → middleware redirect ke `/hr`.

Indeks **tidak** memanggil API POS/Pajak/dll. (lihat §8).

---

| Nama | Route | Page/file | API | Collection | Role yang boleh (middleware) | Status implementasi | Konfigurasi ERP? | Konfigurasi SDM? | Error API |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Indeks Pengaturan | `/pengaturan` | `pengaturan/page.tsx` | Auth store saja | — | Owner `*`; HR `/pengaturan` | **READY** (hub) | Ya (indeks) | Hanya sebagai pintu Role/Notifikasi | Tidak (kecuali leak kartu di overlay lama) |
| Perusahaan | `/pengaturan/perusahaan` | `pengaturan/perusahaan/page.tsx` | `lib/bisnis/company-client` | `biz_company_profile` | Owner (HR **tidak** punya path ini) | **READY** | Ya — ORGANISASI | Tidak | `schemaMissing` UI jika koleksi belum ada |
| Akses Entitas | `/pengaturan/akses-entitas` | `pengaturan/akses-entitas/page.tsx` | `/api/tenant/users/company-access` | tenant company-access (server) | Owner | **READY** | Ya | Tidak | 401/403 jika bukan Owner |
| Konteks Kerja | `/pengaturan/konteks-kerja` | `pengaturan/konteks-kerja/page.tsx` | `WorkContextSettings`: stores + warehouses + context provider | `biz_stores`, inventory warehouses; `/api/tenant/work-context` | Owner (path tidak di HR allow-list) | **READY** | Ya — konteks operasional | Tidak | 401/403 HR |
| Pengguna | `/system/register` | system register | users admin | `users` | Owner (`masterOnly` di nav) | **READY** | Ya | Tidak (bukan master karyawan HR; itu `/hr/employees`) | — |
| Toko | `/bisnis/store` | `bisnis/store/page.tsx` | client bisnis | `biz_stores` | Owner / inventory | **READY** | Ya — COMMERCE | Tidak | HR: redirect |
| Master POS | `/bisnis/pos-registers` | `bisnis/pos-registers/page.tsx` | `/api/pos/registers` | `biz_pos_registers` | Owner / inventory | **READY** | Ya — COMMERCE | Tidak | HR: redirect |
| Master Marketplace | `/bisnis/marketplace` | `bisnis/marketplace/page.tsx` | client bisnis | `biz_sales_channels` / related MP | Owner / inventory | **READY** | Ya — COMMERCE | Tidak | HR: redirect |
| Ekspedisi | `/bisnis/ekspedisi` | `bisnis/ekspedisi/page.tsx` | client bisnis | `biz_couriers`, `biz_courier_services` | Owner / inventory | **READY** | Ya — LOGISTICS | Tidak | HR: redirect |
| Pajak / PPN | `/bisnis/pajak` | `bisnis/pajak/page.tsx` | client bisnis | `biz_tax_rates` | Owner / inventory | **READY** | Ya — KEUANGAN | Tidak | HR: redirect |
| Jatuh Tempo | `/bisnis/term` | `bisnis/term/page.tsx` | client bisnis | `biz_payment_terms` / conditions | Owner / inventory | **READY** | Ya — KEUANGAN | Tidak | HR: redirect |
| Metode Pembayaran | `/bisnis/metode-bayar` | `bisnis/metode-bayar/page.tsx` | client bisnis | `biz_payment_methods` | Owner / inventory | **READY** | Ya — KEUANGAN | Tidak | HR: redirect |
| Template Fee MP | `/bisnis/penjualan-online/template` | **redirect** ke `/bisnis/kalkulasi-harga-jual` | — | `biz_mp_fee_templates` (halaman tujuan) | Owner / inventory | **PARTIAL** — nav label “Template Fee MP”, implementasi = kalkulasi harga jual | Ya — COMMERCE | Tidak | Redirect, bukan 404 |
| Peran & Izin | `/pengaturan/role` | `pengaturan/role/page.tsx` | Tidak (baca `ROLE_ACCESS_SUMMARY` statis) | — | Owner; HR `/pengaturan/role` | **READY** (read-only katalog path) | Ya — SYSTEM | Sebagian (HR boleh lihat ringkasan) | React same-key `/hr/reports` **pernah** (Local sudah `uniquePaths`; overlay lama bisa masih dobel) |
| Notifikasi | `/pengaturan/notifikasi` | `pengaturan/notifikasi/page.tsx` | Tidak | — | Owner; HR | **UI ONLY / PARTIAL** — halaman info + link Profil/Aktivitas; bukan preference engine | Ya — SYSTEM (tipis) | Tidak khusus SDM | Tidak |
| Integrasi | `/pengaturan/integrasi` | `pengaturan/integrasi/page.tsx` | Tidak (tampilkan env PB URL) | — | Owner | **PARTIAL** — dokumentasi koneksi, bukan konektor | Ya — SYSTEM | Tidak | Tidak |
| Log Audit | `/pengaturan/audit-log` | `pengaturan/audit-log/page.tsx` | `GET /api/tenant/audit` | audit tenant | Owner (`masterOnly`) | **READY** | Ya — SYSTEM | Tidak | 403 non-Owner |

### Pengaturan SDM yang **bukan** di Indeks Pengaturan

Ini konfigurasi SDM sungguhan, hidup di seksi **SDM**:

- Pengaturan GPS / kantor → `/hr/offices`
- Jadwal / kalender → `/hr/work-calendar`
- Kuota cuti → `/hr/leave/settings`
- Kompensasi/lembur rate → `/hr/compensation/settings`
- Periode rating → `/hr/rating/periods`

---

## 5. ERP vs SDM Classification

Klasifikasi **tanpa mengubah code**. Item tidak jelas = NEEDS DECISION.

### A. ORGANISASI / CORE ERP

- Perusahaan  
- Akses Entitas  
- Pengguna (`/system/register`)  
- Konteks Kerja  

### B. SDM

- Seluruh `SDM_NAV_ITEMS` operasional  
- `/hr/leave/settings`, `/hr/compensation/settings`  
- `/hr/rating/*`  
- `/hr/reports`, `/hr/findings`  
- **Bukan** Pajak/Toko/POS  

### C. KEUANGAN

- Pajak / PPN  
- Metode Pembayaran  
- Jatuh Tempo  
- (Modul Keuangan sidebar terpisah: kas, hutang, piutang — di luar indeks pengaturan)

### D. COMMERCE / SALES

- Toko  
- Master Marketplace  
- Master POS  
- Template Fee MP (alias kalkulasi harga jual)

### E. LOGISTICS

- Ekspedisi  

### F. SYSTEM

- Peran & Izin  
- Integrasi  
- Notifikasi  
- Log Audit  

### NEEDS DECISION

| Item | Mengapa |
| --- | --- |
| Indeks Pengaturan untuk HR | Apakah HR perlu indeks sama sekali, atau langsung Role + Notifikasi tanpa hub? |
| HR + Peran & Izin | HR boleh melihat katalog path. Apakah HR boleh **mengubah** role user? Halaman saat ini read-only. |
| Pengguna vs Karyawan | Dua pintu identitas (`/system/register` vs `/hr/employees`). |
| Template Fee MP vs Kalkulasi Harga MP | Nav menunjuk template; page redirect ke kalkulasi. |
| Laporan SDM: angka saja vs pintasan operasional | Overlap menu. |
| Temuan HR di sidebar | Ada di mobile + RBAC, tidak di `SDM_NAV_ITEMS`. |
| Label “Role & Permission” vs “Peran & Izin” | Sama rute, beda string nav vs i18n. |

---

## 6. RBAC Visibility Audit

### Role yang ada di model

`account_type=owner` **atau** `role_code`: `hr` | `manager` | `staff` | `staff-basic` | `security` | `ob`.

Tidak ada `admin`. Tidak ada `warehouse` sebagai role_code. Gudang/POS/bisnis: Owner atau flag inventory (`canAccessInventory` / `canBisnis` di Sidebar).

### Visibility sidebar (source)

| Role | SDM | Laporan | Pengaturan | Bisnis/POS/Gudang |
| --- | --- | --- | --- | --- |
| Owner | Ya (penuh) | Ya (penuh) | Ya (penuh) | Ya jika inventory/WMS |
| HR | Ya (penuh SDM) | Subset HR | Subset HR | Tidak |
| Manager / Staff (`dashboard_access`) | Tidak | Tidak | Tidak | Tidak (kecuali inventory flag) |
| Staff-basic / Security / OB | Tidak | Tidak | Tidak | Tidak |
| Inventory-only staff | Tidak | Tidak (kecuali dapat path inventory) | Tidak | Ya sesuai access |

### Pertanyaan: apakah HR perlu melihat Pajak, Toko, Marketplace, POS, Ekspedisi, Metode Bayar, Template MP?

| Menu | Visibility yang **seharusnya** | Alasan dari permission **sekarang** |
| --- | --- | --- |
| Pajak / PPN | **SHOULD BE HIDDEN BY RBAC** | Path tidak ada di `ROLE_ACCESS_BY_CODE.hr`. Bukan pekerjaan SDM. |
| Toko | **SHOULD BE HIDDEN BY RBAC** | Sama. |
| Marketplace | **SHOULD BE HIDDEN BY RBAC** | Sama. |
| Master POS | **SHOULD BE HIDDEN BY RBAC** | Sama. |
| Ekspedisi | **SHOULD BE HIDDEN BY RBAC** | Sama. |
| Metode Pembayaran | **SHOULD BE HIDDEN BY RBAC** | Sama. |
| Template Biaya Marketplace | **SHOULD BE HIDDEN BY RBAC** | Sama. |
| Peran & Izin | **SHOULD REMAIN VISIBLE** | `/pengaturan/role` sengaja di allow-list HR. Halaman read-only. |
| Notifikasi | **SHOULD REMAIN VISIBLE** | `/pengaturan/notifikasi` di allow-list HR. |
| Indeks Pengaturan | **SHOULD REMAIN VISIBLE** (pintu) / **NEEDS DECISION** (apakah perlu hub) | `/pengaturan` di allow-list agar HR masuk ke subset. |
| Perusahaan / Pengguna / Audit / Integrasi | **SHOULD BE HIDDEN BY RBAC** untuk HR | Tidak di allow-list HR. |
| Laporan penjualan dll. | **SHOULD BE HIDDEN BY RBAC** | Tidak di allow-list HR. |

**Gap implementasi (bukan perubahan phase ini):**

- Sidebar: sudah hide.  
- Hub Local: sudah hide.  
- Hub staging lama: **masih bisa menampilkan** kartu terlarang → leak UI, akses nyata ditolak middleware.

---

## 7. API / Console Error Audit

Klasifikasi dari source + observasi sesi sebelumnya (localhost + staging). Phase ini **tidak** memperbaiki.

| URL / gejala | HTTP | Page pemicu | Role | Perlu request? | Endpoint ada? | Terlalu dini? | Expected? | Kelas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/hr/rating/periods` | 503 | `/hr`, `/hr/rating/*` | HR | Ya jika buka Rating | Ya di Next | Dashboard `/hr` memuat shortcut rating | Ya jika PB = production tanpa `hr_rating_*` | **E** TEST/DEV ENV; di staging PB yang sudah schema = harus 200 |
| `/api/hr/rating/my-result` | 503 | layout/nav rating | HR/user | Kadang prefetch | Ya | Bisa dari navigasi rating | Sama | **E** atau **B** jika schema staging belum apply |
| `/api/hr/rating/dashboard` | 503 | `/hr` shortcut card | HR | Ya di dasbor HR | Ya | Ya — fetch saat mount `/hr` | Sama | **E** / pertimbangkan lazy **FIX LATER** |
| `/api/hr/reports` atau PB `hr_staff_reports` | 503 / PB Not Found | `/hr/reports` | semua yg boleh reports | Ya | API source ada | Tidak | Ya jika schema Phase 13 belum di PB | **B** MISSING FEATURE (schema) |
| `/_next/static/chunks/*.js` | 404 `text/plain` | semua halaman staging | siapa saja | Ya (bootstrap Next) | File ada di `.next/static`, sering **tidak** di standalone | n/a | Setelah build tanpa copy static | **A** REAL BUG **ops packaging**, bukan RBAC |
| `/systemLogoWide.png` | 404 | navbar (local file ada) | semua | Ya (branding) | File di `public/` | n/a | Jika standalone `public` tidak tersalin | **A** REAL BUG packaging (prod/staging pernah 404; `/icon` 200 karena route Next) |
| React `same key /hr/reports` | — | `/pengaturan/role` | HR | n/a | n/a | n/a | Path dobel di array role | **A** (Local sudah uniquePaths; overlay lama **A**) |
| Klik Toko/Pajak sebagai HR | redirect `/hr` | hub leak | HR | Tidak | Endpoint bisnis ada | User belum “butuh” | **Expected deny** | **D** RBAC / EXPECTED (bukan 403 JSON; redirect) |
| PB `attendance_logs` / `leave_requests` filter | 4xx PB | `/hr`, `/laporan/sdm` | HR | Ya | Koleksi production biasanya ada | Poll 30s di `/hr` | Tidak jika rules PB menolak list | **F** jika gagal di staging vs **E** jika env salah |
| `/api/tenant/work-context` | 200/401 | layout dashboard | Owner/HR | Ya untuk konteks kerja | Ya | Ya — mount layout, bukan pengaturan | 401 jika session lemah | **E** jika session; else normal |
| `/api/tenant/company-access` | 200/401 | layout | sama | Ya | Ya | Ya — mount layout | sama | sama |
| MIME CSS `text/plain` | 404 | staging blank page | — | Ya | CSS chunk | n/a | 404 HTML/plain, bukan file CSS | **A** packaging (akibat chunk 404) |

Tidak ada bukti bahwa Indeks Pengaturan menembak 404 ke `/api/pos` atau pajak **sebelum** halaman itu dibuka.

---

## 8. Unnecessary Request Audit

### Indeks Pengaturan `/pengaturan`

**Tidak** ada request ke POS, Marketplace, Pajak, Ekspedisi, Payment Methods. Hanya sinkron `pb.authStore` lalu render kartu.

→ Bukan `UNNECESSARY INITIAL REQUEST` ke modul bisnis.

### Indeks Laporan `/laporan`

Sama: kartu saja. Owner mendapat kartu impor MP sebagai tautan, tanpa fetch Excel.

### Indeks SDM `/staff`

Kartu saja. **Tidak** prefetch absensi/payroll.

### Yang **memang** request di awal (bukan halaman Pengaturan)

| Lokasi | Request | Catatan |
| --- | --- | --- |
| Layout dashboard | `/api/tenant/work-context`, `/api/tenant/company-access`, `/api/auth/session`, `/api/tenant/activity`, `/api/user/locale` | Global. Bukan “Pengaturan memuat seluruh ERP”. |
| `/hr` | 5–6 list PB + interval 30s + `/api/hr/rating/dashboard` | **UNNECESSARY** untuk user yang hanya lewat dasbor lalu ke Cuti — rating di-fetch walau tidak membuka Rating. **FIX LATER** (lazy). Tidak diubah sekarang. |
| `/laporan/sdm` | 6 list PB paralel | Wajar untuk halaman laporan; bukan prefetch dari indeks Pengaturan. |
| `/pengaturan/perusahaan` | fetch semua company profile | Hanya setelah buka halaman. |
| `/pengaturan/akses-entitas` | company-access | Hanya setelah buka halaman. |
| `/pengaturan/konteks-kerja` | stores + warehouses | Hanya setelah buka halaman. |

---

## 9. Duplication Audit

| Pasangan | Fungsi | Verdict |
| --- | --- | --- |
| SDM (sidebar) vs Laporan → SDM | Operasional vs ringkasan + pintasan | **PASS — bukan duplikasi modul.** Pintasan overlap = **NEEDS DECISION** |
| `/staff` vs `/hr` | Hub kartu vs dasbor statistik | Dua “home” SDM. **NEEDS DECISION** (kanonik) |
| `/staff/absensi` vs `/hr/attendance` | Alias redirect | Bukan dua fitur. **KEEP** |
| Karyawan vs Pengguna | HR master vs akun sistem | Beda tujuan. **KEEP** |
| Laporan & Temuan vs Laporan SDM | Case/bukti vs angka kehadiran | Beda. **KEEP**. Penempatan “Laporan & Temuan” di SDM (bukan grup Laporan) = **NEEDS DECISION** (IA saja) |
| Akses Entitas di nav + sisipan hub Owner | Kartu bisa dobel | **NEEDS DECISION** / **FIX LATER** |
| Template Fee MP vs Kalkulasi Harga MP | Redirect | **NEEDS DECISION** (satu nama) |

Jangan menghapus SDM atau Laporan SDM pada phase ini.

---

## 10. Mobile Navigation Consideration

**Tidak ada redesign.** Hanya rekomendasi.

Mobile (`mobile/lib/work-dashboard-menu.ts`) **tidak** meniru sidebar web 12 item SDM. Tile native: absensi, cuti, lapangan, laporan staf, temuan HR, plus gudang jika inventory.

| Rekomendasi | Item |
| --- | --- |
| Primary navigation (mobile) | Absensi, Cuti, Laporan (bukti), Meja kerja |
| Submenu / HR-only native | Antrian lapangan, Temuan, Rating (tab existing) |
| Hanya admin/Owner (jangan di tab employee) | Pajak, Toko, POS, Marketplace, Ekspedisi, Metode bayar, Integrasi, Audit, Pengguna sistem |
| Jangan muncul untuk employee/HR | Seluruh katalog Pengaturan Owner |
| Butuh mobile access | Absensi GPS, cuti, lapangan, laporan+foto, (HR) temuan & antrian lapangan, rating tugas |
| Terlalu berat jika disalin 1:1 dari web | 12 item SDM + 15 kartu pengaturan + 8 laporan — **jangan** jadi tab setara web |

Web sudah memisahkan absensi “hanya native” di komentar RBAC; web tetap punya daftar absensi HR.

---

## 11. Recommended Changes

Tidak dieksekusi. Label saja.

| ID | Rekomendasi | Tindakan |
| --- | --- | --- |
| R1 | Pertahankan split SDM operasional vs Laporan SDM | **KEEP** |
| R2 | Pertahankan label Penggajian | **KEEP** |
| R3 | Overlay hub HR ke staging (filter kartu) agar sama Local | **HIDE BY RBAC** (sudah di source; deploy overlay **nanti**, bukan sekarang) |
| R4 | Jangan tampilkan Pajak/Toko/POS/… ke HR | **HIDE BY RBAC** (sidebar sudah; hub staging **FIX LATER**) |
| R5 | Copy `public` + `.next/static` ke standalone setiap build | **FIX LATER** (ops) — logo/chunk 404 |
| R6 | Lazy-load rating dashboard di `/hr` | **FIX LATER** |
| R7 | Schema Rating/Reporting hanya di staging sampai Owner approve | **KEEP** (jangan production) |
| R8 | Satu home SDM (`/staff` vs `/hr`) | **NEEDS DECISION** |
| R9 | Temuan HR di sidebar atau cukup di dalam Laporan & Temuan | **NEEDS DECISION** |
| R10 | Laporan SDM: tetap pintasan atau jadi laporan periode/export | **NEEDS DECISION** |
| R11 | HR + halaman Role: tetap lihat-only atau cabut dari HR | **NEEDS DECISION** |
| R12 | Kartu Akses Entitas dobel di hub Owner | **FIX LATER** |
| R13 | Align label Template Fee MP dengan redirect | **NEEDS DECISION** / **REGROUP** |
| R14 | Pengaturan GPS = master kantor — rename? | **NEEDS DECISION** (jangan ubah nama di phase ini) |
| R15 | Notifikasi: halaman info vs preference sungguhan | **MISSING FEATURE** jika Owner ingin toggle email/push |
| R16 | Jangan `git add -A` / jangan ship dirty tree sebagai RC | **KEEP** (safety) |

---

## 12. NEEDS DECISION (Owner)

1. Apakah Indeks Pengaturan HR tetap ada, atau HR hanya Role + Notifikasi tanpa hub?  
2. Apakah HR harus tetap melihat **Peran & Izin** (read-only)?  
3. Satu URL kanonik SDM: `/hr` atau `/staff`?  
4. Apakah Laporan SDM boleh tetap menaut ke halaman operasional, atau harus laporan terpisah (periode, export)?  
5. Apakah **Temuan HR** wajib di sidebar web, atau cukup di dalam Laporan & Temuan + mobile?  
6. Apakah “Laporan & Temuan” pindah ke grup Laporan (hanya informasi arsitektur — jangan pindah sekarang)?  
7. Apakah Rating/Laporan-Temuan boleh production, atau staging-only sampai UAT?  
8. Rename “Pengaturan GPS” → “Kantor & Geofence”? (phase ini: jangan rename.)  
9. Satu nama: Template Fee MP vs Kalkulasi Harga MP?

---

## 13. Production Safety

| Cek | Hasil |
| --- | --- |
| Production Next diubah? | **Tidak** |
| Production PB diubah? | **Tidak** |
| Migration/schema production? | **Tidak** |
| Restart `erp-system` / `pb-erp`? | **Tidak** |
| Deploy? | **Tidak** |
| Code aplikasi diubah phase ini? | **Tidak** (hanya file laporan ini) |
| Staging | Boleh dibaca; tidak di-mutate pada phase ini |

Production **UNTOUCHED**.

---

## 14. Final Summary

| Area | Status | Critical? | Recommendation |
| --- | --- | --- | --- |
| SDM | READY operasional; Rating/Reports PARTIAL (schema env) | Tidak untuk CRUD inti; Rating env **ya** di localhost→prod PB | **KEEP** menu; **FIX LATER** env/schema staging |
| Laporan | Hub READY; Laporan SDM PARTIAL (bukan analytics penuh) | Tidak | **KEEP** pemisahan; **NEEDS DECISION** kedalaman laporan |
| Pengaturan | Owner READY; HR subset benar di sidebar/source | Leak hub staging **sedang** (UX), bukan data leak | **HIDE BY RBAC** di hub staging **FIX LATER** |
| RBAC | Path HR tanpa pajak/toko/POS | Tidak (middleware deny) | **KEEP** rules; jangan longgarkan |
| API | HR operasional = PB; Rating/Reports = Next API | 503 hanya env salah | **E** / **B**; jangan production schema |
| Console errors | Chunk/logo 404 = packaging; rating 503 = env; key dobel = sudah diatasi Local | Chunk/logo **ya** di staging/prod aset | **FIX LATER** standalone copy; jangan coding phase ini |
| Mobile navigation | Sudah lebih ramping dari web | Tidak | **KEEP** native subset; jangan salin sidebar web |

### A. HAL YANG SUDAH BENAR

- Sidebar HR ≠ katalog Owner.  
- Middleware memblok path bisnis untuk HR.  
- SDM = operasional; Laporan SDM = ringkasan (niat benar).  
- Nama menu **Penggajian**.  
- Indeks Pengaturan tidak menembak API seluruh master data.  
- Role model tanpa “admin” palsu; Owner = `*`.  
- GPS kantor, cuti, absensi, lapangan, karyawan punya UI + backend.

### B. HAL YANG PERLU DIPERBAIKI (nanti, bukan sekarang)

- Overlay hub HR ke staging.  
- Copy `public` + `.next/static` ke standalone (logo + chunk).  
- Unique path role di overlay lama `/pengaturan/role`.  
- Lazy rating fetch di `/hr`.  
- Kartu Akses Entitas dobel (Owner hub).

### C. HAL YANG BELUM SELESAI

- Schema Rating/Reporting di setiap lingkungan.  
- UAT device mobile.  
- Notifikasi sebagai preference engine.  
- Laporan SDM sebagai paket analitik (export/periode).  
- Temuan di IA sidebar.

### D. HAL YANG TIDAK PERLU DISENTUH

- Production.  
- Leave write-lock.  
- Payroll/Inventory/POS **business logic**.  
- Menghapus SDM atau Laporan SDM.  
- Mengganti “Penggajian” → “Pengajian”.  
- Mengubah nama menu pada phase ini.

### E. DECISION YANG HARUS DIMINTA KE OWNER

Lihat §12 (sembilan keputusan). Tanpa itu, phase berikutnya jangan merombak sidebar.

---

**STOP.** Audit selesai. Tidak ada coding, tidak ada deploy. Production tetap untouched.
