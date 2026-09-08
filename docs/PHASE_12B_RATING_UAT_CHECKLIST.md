# PHASE 12B — HR Rating UAT Checklist

**Sumber tes (hanya ini, tidak ada skenario baru):**

- `npm run test:hr-rating-api-staging` → `scripts/test-hr-rating-api-staging.mjs` (20 `record()`)
- `npm run test:hr-rating-unit` → `scripts/test-hr-rating-unit.mjs` (24 `record()`)

**Lingkungan UAT:** `https://staging.serba.space`  
**PocketBase:** staging `127.0.0.1:8092` (bukan production `:8091`)  
**Production:** tidak diubah · tidak di-deploy

**Hasil otomatis terakhir (laporan 2026-08-13):**

| Suite | Hasil |
| --- | --- |
| `test:hr-rating-unit` | **PASS=24 FAIL=0** |
| `test:hr-rating-api-staging` | **PASS=20 FAIL=0 WARN=0** |

**Target akhir**

| Gate | Status |
| --- | --- |
| Smoke test (API-01 … API-05 + login UI) | **PASS** (otomatis) — Owner konfirmasi login staging di Bagian B |
| Manual UAT (Bagian B) | **______** (diisi Owner) |
| Production | **tidak ada perubahan** |

**Akun fixture tes API (jangan ganti skenario):**

| Peran di skrip | Email |
| --- | --- |
| employee (subject) | `smoke-employee@serba.test` |
| hr | `smoke-hr@serba.test` |
| owner (jika ada) | `smoke-owner@serba.test` |
| warehouse (peer) | `smoke-warehouse@serba.test` |
| peer3 | `smoke-manager@serba.test` atau `smoke-staff@serba.test` |

Password: `SMOKE_PASSWORD` di `.env.local` / `.env.staging.local` (jangan tulis password di checklist ini).

**Halaman UI yang dipakai tes API (bukan halaman baru):**

| Path | Tab |
| --- | --- |
| `/login` | Login |
| `/hr/rating` | Dasbor |
| `/hr/rating/periods` | Periode |
| `/hr/rating/assignments` | Assignment |
| `/hr/rating/assignments/[id]` | Detail assignment |
| `/hr/rating/results` | Hasil |
| `/hr/rating/tasks` | Tugas saya |
| `/hr/rating/my-result` | Hasil saya |

---

## A. API / security test — sudah otomatis PASS

Semua baris di bawah adalah `record()` persis dari `test-hr-rating-api-staging.mjs`.  
Status = hasil otomatis **PASS=20 FAIL=0 WARN=0**. Tidak perlu diulang via curl/Postman.

### API-01 — Preflight Next health

| Field | Isi |
| --- | --- |
| **Test ID** | API-01 |
| **Tujuan** | Next staging merespons (`/api/health` 200 **atau** `/login` 200). Skrip menerima `login=200` jika `/api/health` tidak ada. |
| **Precondition** | Staging Next hidup (`erp-system-staging` / `https://staging.serba.space`). |
| **Langkah manual di UI** | Tidak. Sudah otomatis. |
| **Expected result** | `health === 200 \|\| loginOk === 200` |
| **Data yang harus terlihat** | HTTP 200 pada `/login` (atau `/api/health` jika ada). |
| **Status** | **PASS** |

### API-02 — Preflight PB health

| Field | Isi |
| --- | --- |
| **Test ID** | API-02 |
| **Tujuan** | PocketBase staging `GET /api/health` = 200. |
| **Precondition** | `pb-erp-staging` online, URL staging-only. |
| **Langkah manual di UI** | Tidak. Sudah otomatis. |
| **Expected result** | HTTP 200 |
| **Data yang harus terlihat** | Body health PocketBase (bukan production `:8091`). |
| **Status** | **PASS** |

### API-03 — Staging admin

| Field | Isi |
| --- | --- |
| **Test ID** | API-03 |
| **Tujuan** | Auth admin staging (`POCKETBASE_STAGING_ADMIN_*`) berhasil. |
| **Precondition** | Kredensial admin staging di env (bukan production). |
| **Langkah manual di UI** | Tidak. Sudah otomatis. |
| **Expected result** | Token admin ada. |
| **Data yang harus terlihat** | Login admin staging OK. |
| **Status** | **PASS** |

### API-04 — Schema hr_rating_periods

| Field | Isi |
| --- | --- |
| **Test ID** | API-04 |
| **Tujuan** | Koleksi `hr_rating_periods` ada di PB staging. |
| **Precondition** | Schema Rating sudah di-apply ke staging. |
| **Langkah manual di UI** | Tidak. Sudah otomatis. |
| **Expected result** | GET collection HTTP 200 |
| **Data yang harus terlihat** | Collection `hr_rating_periods` terdaftar. |
| **Status** | **PASS** |

### API-05 — Smoke login

| Field | Isi |
| --- | --- |
| **Test ID** | API-05 |
| **Tujuan** | User smoke `employee`, `hr`, `warehouse` (+ `owner` opsional) bisa `auth-with-password`. |
| **Precondition** | User smoke + `SMOKE_PASSWORD` ada di staging PB. |
| **Langkah manual di UI** | Tidak diulang sebagai tes API. Konfirmasi UI ada di Bagian B (API-05). |
| **Expected result** | Setiap auth HTTP 200 + token. |
| **Data yang harus terlihat** | Login smoke user berhasil. |
| **Status** | **PASS** (otomatis) |

### API-06 — Create period

| Field | Isi |
| --- | --- |
| **Test ID** | API-06 |
| **Tujuan** | HR/Owner `POST /api/hr/rating/periods` membuat periode. |
| **Precondition** | Token owner (atau hr). |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | HTTP 200, `json.data.id` ada. Body tes: `name: Phase12 {timestamp}`, `start_date: 2026-08-01`, `end_date: 2026-08-31`, `status: open`. |
| **Data yang harus terlihat** | Period id baru, status `open`. |
| **Status** | **PASS** |

### API-07 — Insufficient eligible DENY

| Field | Isi |
| --- | --- |
| **Test ID** | API-07 |
| **Tujuan** | `reviewer_count: 20` + `smart_random` ditolak; tidak membuat assignment parsial. |
| **Precondition** | Period API-06 ada; subject = smoke-employee. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | HTTP **400** dan `error` mengandung `"Reviewer tersedia"`. |
| **Data yang harus terlihat** | Pesan: `Reviewer tersedia hanya X orang dari Y yang diminta.` Assignment tidak terbentuk. |
| **Status** | **PASS** |

### API-08 — Smart random N reviewers

| Field | Isi |
| --- | --- |
| **Test ID** | API-08 |
| **Tujuan** | Smart random memilih persis N reviewer (N=3 jika ada peer3, else N=2). |
| **Precondition** | Employee + warehouse + hr (dan peer3 jika ada) di company yang sama, dept `Phase12Ops`, div `Phase12Div`. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | HTTP 200, `(reviewers \|\| []).length === countWanted`. |
| **Data yang harus terlihat** | Jumlah reviewer = N yang diminta. |
| **Status** | **PASS** |

### API-09 — Assignment method recorded

| Field | Isi |
| --- | --- |
| **Test ID** | API-09 |
| **Tujuan** | Method tersimpan `smart_random`. |
| **Precondition** | API-08 sukses. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | `assignment.assignment_method === "smart_random"` |
| **Data yang harus terlihat** | Method = Smart Random (bukan manual). |
| **Status** | **PASS** |

### API-10 — HR cannot assign self

| Field | Isi |
| --- | --- |
| **Test ID** | API-10 |
| **Tujuan** | HR tidak boleh membuat assignment dengan subject = dirinya. |
| **Precondition** | Token `smoke-hr`. Period API-06. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | HTTP **403** |
| **Data yang harus terlihat** | Assignment self tidak terbentuk. |
| **Status** | **PASS** |

### API-11 — Subject result no reviewer ids (pre)

| Field | Isi |
| --- | --- |
| **Test ID** | API-11 |
| **Tujuan** | `GET /api/hr/rating/my-result` sebagai subject **tidak** membocorkan id reviewer / `reviewer_row` (sebelum submit). |
| **Precondition** | Token smoke-employee; assignment API-08 ada. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | HTTP 200, payload tidak mengandung warehouse user id dan tidak mengandung `"reviewer_row"`. |
| **Data yang harus terlihat** | Agregat / progress saja; tanpa nama/id reviewer. |
| **Status** | **PASS** |

### API-12 — Reviewer tasks only own

| Field | Isi |
| --- | --- |
| **Test ID** | API-12 |
| **Tujuan** | `GET /api/hr/rating/my-tasks` hanya tugas reviewer yang login. |
| **Precondition** | Auth sebagai `reviewers[0]` dari API-08. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | Setiap item `t.reviewer ===` user id yang login. |
| **Data yang harus terlihat** | Hanya tugas milik sendiri. |
| **Status** | **PASS** |

### API-13 — Reviewer draft save

| Field | Isi |
| --- | --- |
| **Test ID** | API-13 |
| **Tujuan** | `PUT /api/hr/rating/tasks/{id}` simpan draft skor. |
| **Precondition** | API-12; aspek dari `GET /api/hr/rating/aspects`. Body tes: setiap aspek `score: 4`, `comment: "ok"`. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | HTTP 200 |
| **Data yang harus terlihat** | Draft tersimpan; tugas belum locked. |
| **Status** | **PASS** |

### API-14 — Reviewer submit lock

| Field | Isi |
| --- | --- |
| **Test ID** | API-14 |
| **Tujuan** | `POST /api/hr/rating/tasks/{id}` `{ action: "submit" }` mengunci. |
| **Precondition** | Draft API-13. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | HTTP 200 |
| **Data yang harus terlihat** | Status submitted/locked. |
| **Status** | **PASS** |

### API-15 — Locked edit DENY

| Field | Isi |
| --- | --- |
| **Test ID** | API-15 |
| **Tujuan** | Setelah submit, PUT skor lagi ditolak. |
| **Precondition** | API-14 selesai. Body tes: skor diubah ke `1`. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | HTTP **400** |
| **Data yang harus terlihat** | Skor tidak berubah menjadi 1. |
| **Status** | **PASS** |

### API-16 — Employee detail DENY

| Field | Isi |
| --- | --- |
| **Test ID** | API-16 |
| **Tujuan** | Subject/employee tidak boleh `GET /api/hr/rating/assignments/{id}` (detail HR). |
| **Precondition** | Token smoke-employee; `assignmentId` dari API-08. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | HTTP **403** |
| **Data yang harus terlihat** | Tidak ada daftar reviewer / skor mentah. |
| **Status** | **PASS** |

### API-17 — HR detail PASS

| Field | Isi |
| --- | --- |
| **Test ID** | API-17 |
| **Tujuan** | HR boleh buka detail assignment; `reviewers` array. |
| **Precondition** | Token smoke-hr; assignment API-08. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | HTTP **200** dan `Array.isArray(json.reviewers)` |
| **Data yang harus terlihat** | Nama reviewer, tier, skor mentah (HR/Owner). |
| **Status** | **PASS** |

### API-18 — Progress respondents X/Y

| Field | Isi |
| --- | --- |
| **Test ID** | API-18 |
| **Tujuan** | `progress.respondents_label` berbentuk X/Y (mengandung `/`). |
| **Precondition** | Response API-17. |
| **Langkah manual di UI** | Bagian B. |
| **Expected result** | `typeof respondents_label === "string"` dan `includes("/")` |
| **Data yang harus terlihat** | Contoh setelah 1 submit dari 2 reviewer: **`1 / 2`** (bukan angka mentah saja). |
| **Status** | **PASS** |

### API-19 — Unauthorized DENY

| Field | Isi |
| --- | --- |
| **Test ID** | API-19 |
| **Tujuan** | `POST /api/hr/rating/periods` tanpa token ditolak. |
| **Precondition** | Tidak ada `Authorization`. |
| **Langkah manual di UI** | Tidak. Sudah otomatis (Bagian C). |
| **Expected result** | HTTP **401** |
| **Data yang harus terlihat** | Period tidak terbuat. |
| **Status** | **PASS** |

### API-20 — Direct PB mutation DENY

| Field | Isi |
| --- | --- |
| **Test ID** | API-20 |
| **Tujuan** | User token **tidak** boleh `POST` langsung ke `hr_rating_periods` di PocketBase (rules null; tulis lewat Next admin). |
| **Precondition** | Token smoke-employee ke URL PB staging. |
| **Langkah manual di UI** | Tidak. Sudah otomatis (Bagian C). |
| **Expected result** | HTTP **401 atau 403 atau 400** |
| **Data yang harus terlihat** | Record `name: "hack"` tidak masuk. |
| **Status** | **PASS** |

---

## B. Manual UAT — dilakukan Owner

Hanya case API yang **punya permukaan UI**. Test ID sama dengan Bagian A.  
Isi **PASS/FAIL** di kolom Status. Jangan menambah skenario di luar daftar ini.

**Cara:** buka `https://staging.serba.space` (bukan localhost→production). Hard refresh jika cache lama.

### API-05 — Smoke login (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-05 |
| **Tujuan** | Sama: smoke user bisa masuk dashboard staging. |
| **Precondition** | Akun smoke di atas; PB staging. |
| **Langkah manual di UI** | 1. Buka `/login`. 2. Masuk `smoke-hr@serba.test`. 3. Logout. 4. Masuk `smoke-employee@serba.test`. |
| **Expected result** | Masuk dashboard, bukan error koneksi/CORS. |
| **Data yang harus terlihat** | Nama user + peran; sidebar SDM → Penilaian / Rating. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-06 — Create period (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-06 |
| **Tujuan** | Sama: HR/Owner membuat periode. |
| **Precondition** | Login `smoke-hr` atau `smoke-owner`. |
| **Langkah manual di UI** | 1. Tab **Periode**. 2. Isi nama, tanggal mulai `2026-08-01`, selesai `2026-08-31`. 3. Simpan (status open/draft sesuai form). 4. Jika form hanya draft: buka lifecycle sampai **open** seperti body tes `status: "open"`. |
| **Expected result** | Periode muncul di daftar. |
| **Data yang harus terlihat** | Nama periode, tanggal, status. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-07 — Insufficient eligible DENY (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-07 |
| **Tujuan** | Sama: requested > eligible → ditolak, tidak diam-diam kurangi. |
| **Precondition** | Periode open; subject karyawan; **Jumlah reviewer = 20** (nilai persis di skrip). |
| **Langkah manual di UI** | 1. Tab **Assignment**. 2. Pilih period. 3. Subject = karyawan. 4. Jumlah reviewer **20**. 5. Metode Smart Random. 6. Preview eligible (jika ada) lalu **Create assignment**. |
| **Expected result** | Gagal create. Pesan mengandung **Reviewer tersedia**. |
| **Data yang harus terlihat** | `Reviewer tersedia hanya X orang dari 20 yang diminta.` Daftar assignment **tidak** bertambah untuk percobaan ini. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-08 + API-09 — Smart random N + method recorded (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-08, API-09 |
| **Tujuan** | Sama: create dengan N=2 (atau 3 jika pool cukup); method `smart_random`. |
| **Precondition** | Period open; subject bukan HR itu sendiri; N sama dengan tes (2 tanpa manager/staff, 3 jika peer ketiga eligible). |
| **Langkah manual di UI** | 1. Tab **Assignment**. 2. Period + subject karyawan. 3. Jumlah reviewer **2** (atau **3**). 4. Metode **Smart Random**. 5. Create. 6. Buka detail. |
| **Expected result** | Assignment terbentuk; jumlah reviewer terpilih = N; method Smart Random. |
| **Data yang harus terlihat** | Kolom Method = smart_random / Smart Random. Selected = N. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-10 — HR cannot assign self (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-10 |
| **Tujuan** | Sama: HR subject = diri sendiri → 403. |
| **Precondition** | Login **smoke-hr** (bukan owner). |
| **Langkah manual di UI** | 1. Tab **Assignment**. 2. Subject = akun HR yang sedang login. 3. Reviewer count 2. 4. Smart Random. 5. Create. |
| **Expected result** | Ditolak (403 / pesan akses). |
| **Data yang harus terlihat** | Tidak ada assignment baru dengan subject = HR tersebut. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-11 — Subject result no reviewer ids (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-11 |
| **Tujuan** | Sama: halaman Hasil saya tidak menampilkan identitas reviewer. |
| **Precondition** | Login **smoke-employee** yang jadi subject assignment API-08. |
| **Langkah manual di UI** | 1. Tab **Hasil saya**. 2. Baca seluruh halaman + Network `GET /api/hr/rating/my-result` jika perlu. |
| **Expected result** | Tidak ada nama/id reviewer, tidak ada `reviewer_row`. |
| **Data yang harus terlihat** | Agregat / progress / “belum ada hasil” saja. Teks privasi: identitas reviewer tidak ditampilkan. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-12 — Reviewer tasks only own (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-12 |
| **Tujuan** | Sama: Tugas saya hanya milik reviewer yang login. |
| **Precondition** | Login sebagai salah satu reviewer hasil Smart Random (bukan subject). |
| **Langkah manual di UI** | 1. Tab **Tugas saya**. |
| **Expected result** | Hanya tugas untuk user ini. |
| **Data yang harus terlihat** | Period + subject; tidak ada tugas reviewer lain. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-13 — Reviewer draft save (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-13 |
| **Tujuan** | Sama: simpan draft. Skrip mengisi semua aspek score **4**, comment **ok**. |
| **Precondition** | API-12; form **Isi penilaian** terbuka. |
| **Langkah manual di UI** | 1. Isi skor 1–5 per aspek (selaras tes: 4). 2. Komentar opsional. 3. **Simpan draft**. |
| **Expected result** | Pesan draft tersimpan; belum terkunci. |
| **Data yang harus terlihat** | Skor draft masih bisa diubah. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-14 — Reviewer submit lock (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-14 |
| **Tujuan** | Sama: Submit & kunci. |
| **Precondition** | Draft API-13. |
| **Langkah manual di UI** | 1. **Submit & kunci**. |
| **Expected result** | Terkirim & terkunci. |
| **Data yang harus terlihat** | Status submitted/locked. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-15 — Locked edit DENY (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-15 |
| **Tujuan** | Sama: edit setelah lock ditolak. |
| **Precondition** | API-14. |
| **Langkah manual di UI** | 1. Buka lagi tugas yang sama. 2. Ubah skor (tes API memakai 1). 3. Simpan draft. |
| **Expected result** | Ditolak (400 / tidak tersimpan). |
| **Data yang harus terlihat** | Skor tetap nilai submit, bukan 1. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-16 — Employee detail DENY (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-16 |
| **Tujuan** | Sama: employee tidak boleh lihat detail HR `/hr/rating/assignments/{id}`. |
| **Precondition** | Login smoke-employee; ketahui URL detail dari HR (atau tempel path assignment id). |
| **Langkah manual di UI** | 1. Buka `/hr/rating/assignments/{id}` sebagai employee. |
| **Expected result** | 403 / akses ditolak; bukan daftar reviewer. |
| **Data yang harus terlihat** | Tidak ada nama reviewer, tier, JSON skor mentah. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

### API-17 + API-18 — HR detail + respondents X/Y (UI)

| Field | Isi |
| --- | --- |
| **Test ID** | API-17, API-18 |
| **Tujuan** | Sama: HR lihat reviewer + label progress mengandung `/`. |
| **Precondition** | Login smoke-hr; assignment yang sama; minimal 1 reviewer sudah submit (API-14) jika ingin melihat `1 / 2`. |
| **Langkah manual di UI** | 1. Tab **Assignment** → Detail. 2. Cek Dasbor / **Hasil** untuk label respondents. |
| **Expected result** | Detail 200; `reviewers` terlihat; respondents **X / Y**. |
| **Data yang harus terlihat** | Requested / Eligible / Selected / Completed sebagai pecahan. Respondents mis. `1 / 2`. Status In Progress atau Complete sesuai completed vs selected. |
| **Status** | [ ] PASS &nbsp; [ ] FAIL |

**Rekap Manual UAT Owner**

| Test ID | PASS | FAIL |
| --- | --- | --- |
| API-05 | | |
| API-06 | | |
| API-07 | | |
| API-08 + API-09 | | |
| API-10 | | |
| API-11 | | |
| API-12 | | |
| API-13 | | |
| API-14 | | |
| API-15 | | |
| API-16 | | |
| API-17 + API-18 | | |

Manual UAT = **PASS** hanya jika semua baris di atas PASS.

---

## C. Tidak perlu diulang manual — sudah tervalidasi otomatis

### C1. Seluruh unit test (`test:hr-rating-unit`) — 24 case

Tidak ada UI. Logic murni di `scripts/test-hr-rating-unit.mjs`. Status otomatis **PASS=24**.

#### UNIT-01 — cat 4.50 Sangat Baik

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-01 |
| **Tujuan** | Skor 4.50 → kategori **Sangat Baik**. |
| **Precondition** | Tidak ada. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `categorizeOverallScore(4.5) === "Sangat Baik"` |
| **Data yang harus terlihat** | Kategori Sangat Baik pada batas 4.50. |
| **Status** | **PASS** — skip manual |

#### UNIT-02 — cat 4.49 Baik

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-02 |
| **Tujuan** | 4.49 → **Baik**. |
| **Precondition** | — |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `"Baik"` |
| **Data yang harus terlihat** | Batas bawah Sangat Baik tidak inklusif untuk 4.49. |
| **Status** | **PASS** — skip manual |

#### UNIT-03 — cat 4.00 Baik

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-03 |
| **Tujuan** | 4.00 → **Baik**. |
| **Precondition** | — |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `"Baik"` |
| **Data yang harus terlihat** | — |
| **Status** | **PASS** — skip manual |

#### UNIT-04 — cat 3.99 Perlu Peningkatan

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-04 |
| **Tujuan** | 3.99 → **Perlu Peningkatan**. |
| **Precondition** | — |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `"Perlu Peningkatan"` |
| **Data yang harus terlihat** | — |
| **Status** | **PASS** — skip manual |

#### UNIT-05 — cat 2.99 Perlu Perhatian HR

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-05 |
| **Tujuan** | 2.99 → **Perlu Perhatian HR**. |
| **Precondition** | — |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `"Perlu Perhatian HR"` |
| **Data yang harus terlihat** | — |
| **Status** | **PASS** — skip manual |

#### UNIT-06 — overall calc 4.25

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-06 |
| **Tujuan** | Mean-of-means: reviewer1 (5+4)/2=4.5, reviewer2 (4+4)/2=4 → overall **4.25**. |
| **Precondition** | Dua reviewer, dua aspek (discipline, teamwork). |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `overallScore === 4.25` |
| **Data yang harus terlihat** | 4.25 |
| **Status** | **PASS** — skip manual |

#### UNIT-07 — respondents 2

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-07 |
| **Tujuan** | `respondentCount === 2` untuk kalkulasi UNIT-06. |
| **Precondition** | Sama UNIT-06. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | 2 |
| **Data yang harus terlihat** | 2 responden. |
| **Status** | **PASS** — skip manual |

#### UNIT-08 — discipline avg 4.5

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-08 |
| **Tujuan** | Rata-rata aspek discipline (5 dan 4) = **4.5**. |
| **Precondition** | Sama UNIT-06. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `aspectCode === "discipline"` average **4.5** |
| **Data yang harus terlihat** | 4.5 |
| **Status** | **PASS** — skip manual |

#### UNIT-09 — category Baik

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-09 |
| **Tujuan** | Overall 4.25 → kategori **Baik**. |
| **Precondition** | UNIT-06. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `"Baik"` |
| **Data yang harus terlihat** | Baik |
| **Status** | **PASS** — skip manual |

#### UNIT-10 — excludes self

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-10 |
| **Tujuan** | Subject `andi` tidak masuk pool. |
| **Precondition** | Fixture kandidat di skrip (andi, budi, citra, deni, eka, fajar, gita). |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | Pool tidak berisi `andi`. |
| **Data yang harus terlihat** | Self excluded. |
| **Status** | **PASS** — skip manual |

#### UNIT-11 — excludes inactive

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-11 |
| **Tujuan** | `deni` inactive tidak eligible. |
| **Precondition** | Fixture skrip. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | Pool tidak berisi `deni`. |
| **Data yang harus terlihat** | Inactive excluded. |
| **Status** | **PASS** — skip manual |

#### UNIT-12 — excludes wrong company

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-12 |
| **Tujuan** | `eka` company `c2` vs subject `c1` tidak eligible. |
| **Precondition** | Fixture skrip. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | Pool tidak berisi `eka`. |
| **Data yang harus terlihat** | Cross-company excluded. |
| **Status** | **PASS** — skip manual |

#### UNIT-13 — excludes company-only irrelevant

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-13 |
| **Tujuan** | D1=A: `fajar` sama company tapi beda dept/div/office **tidak** eligible (bukan company-only). |
| **Precondition** | Fixture skrip. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | Pool tidak berisi `fajar`. |
| **Data yang harus terlihat** | Company-only excluded. |
| **Status** | **PASS** — skip manual |

#### UNIT-14 — includes dept

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-14 |
| **Tujuan** | `budi` dept Ops sama → eligible (tier department). |
| **Precondition** | Fixture skrip. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | Pool berisi `budi`. |
| **Data yang harus terlihat** | Dept match. |
| **Status** | **PASS** — skip manual |

#### UNIT-15 — includes div

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-15 |
| **Tujuan** | `citra` division Warehouse sama → eligible. |
| **Precondition** | Fixture skrip. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | Pool berisi `citra`. |
| **Data yang harus terlihat** | Division match. |
| **Status** | **PASS** — skip manual |

#### UNIT-16 — includes office

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-16 |
| **Tujuan** | `gita` office `off1` sama → eligible. |
| **Precondition** | Fixture skrip. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | Pool berisi `gita`. |
| **Data yang harus terlihat** | Office match. |
| **Status** | **PASS** — skip manual |

#### UNIT-17 — smart random selects 3

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-17 |
| **Tujuan** | `selectSmartRandomReviewers(pool, 3)` ok dan `selected.length === 3`. |
| **Precondition** | Pool UNIT-10…16; rng `() => 0.1`. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `ok && selected.length === 3` |
| **Data yang harus terlihat** | 3 reviewer. |
| **Status** | **PASS** — skip manual |

#### UNIT-18 — insufficient pool

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-18 |
| **Tujuan** | Minta 99 reviewer → `ok === false`, pesan mengandung `Reviewer tersedia hanya`. |
| **Precondition** | Pool yang sama. |
| **Langkah manual di UI** | Tidak (UI-nya adalah API-07). |
| **Expected result** | `!ok` + substring `Reviewer tersedia hanya` |
| **Data yang harus terlihat** | Pesan insufficient. |
| **Status** | **PASS** — skip manual |

#### UNIT-19 — incomplete still aggregates 1 reviewer

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-19 |
| **Tujuan** | Satu reviewer sudah skor → tetap agregat (current), overall **4**. |
| **Precondition** | Satu reviewer, dua aspek skor 4. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `respondentCount === 1 && overallScore === 4` |
| **Data yang harus terlihat** | Current aggregate, bukan menunggu semua. |
| **Status** | **PASS** — skip manual |

#### UNIT-20 — progress 1/2

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-20 |
| **Tujuan** | requested 2, selected 2, completed 1 → `1 / 2`, In Progress, current. |
| **Precondition** | — |
| **Langkah manual di UI** | Tidak (tampilan UI = API-18). |
| **Expected result** | `respondents_label === "1 / 2"`, `status_label === "In Progress"`, `aggregate_kind === "current"` |
| **Data yang harus terlihat** | `1 / 2` |
| **Status** | **PASS** — skip manual |

#### UNIT-21 — progress 2/2 complete

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-21 |
| **Tujuan** | completed 2/2 → Complete + final. |
| **Precondition** | requested 2, selected 2, completed 2. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `"2 / 2"`, `"Complete"`, `"final"` |
| **Data yang harus terlihat** | `2 / 2` |
| **Status** | **PASS** — skip manual |

#### UNIT-22 — reviewer count 1

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-22 |
| **Tujuan** | 1/1 → `is_complete` true. |
| **Precondition** | requested 1, selected 1, completed 1. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `is_complete === true` |
| **Data yang harus terlihat** | Complete |
| **Status** | **PASS** — skip manual |

#### UNIT-23 — reviewer count 4 incomplete

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-23 |
| **Tujuan** | 1 dari 4 selesai → belum complete. |
| **Precondition** | requested 4, selected 4, completed 1. |
| **Langkah manual di UI** | Tidak. |
| **Expected result** | `is_complete === false` |
| **Data yang harus terlihat** | Incomplete |
| **Status** | **PASS** — skip manual |

#### UNIT-24 — eligible < requested message

| Field | Isi |
| --- | --- |
| **Test ID** | UNIT-24 |
| **Tujuan** | Teks persis: 2 tersedia dari 4 diminta. |
| **Precondition** | — |
| **Langkah manual di UI** | Tidak (teks yang sama dicek API-07). |
| **Expected result** | `"Reviewer tersedia hanya 2 orang dari 4 yang diminta."` |
| **Data yang harus terlihat** | String persis itu. |
| **Status** | **PASS** — skip manual |

### C2. API tanpa UI yang tidak diulang di Bagian B

| Test ID | Nama `record()` | Alasan skip manual |
| --- | --- | --- |
| API-01 | Preflight Next health | Probe HTTP, bukan layar Rating. |
| API-02 | Preflight PB health | Probe PB. |
| API-03 | Staging admin | Kredensial admin, bukan login ERP user. |
| API-04 | Schema hr_rating_periods | Cek collection PB. |
| API-19 | Unauthorized DENY | Request tanpa token; bukan alur form. |
| API-20 | Direct PB mutation DENY | POST langsung ke PB, bukan UI Next. |

---

## Sign-off

| Gate | Hasil |
| --- | --- |
| Unit 24 | **PASS** (otomatis, Bagian C) |
| API 20 | **PASS** (otomatis, Bagian A) |
| Smoke (API-01…05) | **PASS** (otomatis) + Owner centang API-05 UI |
| Manual UAT Bagian B | [ ] PASS &nbsp; [ ] FAIL |
| Production schema / deploy / `:8091` / `pb-erp` | **tidak diubah** |

Owner: _________________ Tanggal: _________________
