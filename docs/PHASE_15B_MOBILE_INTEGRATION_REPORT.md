# PHASE 15B — Mobile Integration Completion

**Date:** 2026-08-27  
**Mode:** IMPLEMENTATION TERBATAS — source/integration only.

Tidak ada `eas build`. Tidak ada production/staging deploy. Schema tidak diubah. Rating / Attendance-GPS / Leave business logic server **tidak** diubah. WIP Retur/WMS **tidak** disentuh.

Mobile source: `mobile/` (Expo). API: existing Next.js `/api/hr/rating/*`, `/api/hr/reports`, `/api/hr/findings`.

---

## Status matrix

| Area | Status |
| --- | --- |
| Rating | **PASS** |
| Reporting | **PASS** |
| Findings | **PASS** |
| Attachment | **PASS** |
| Camera | **PASS** |
| Gallery | **PASS** |
| I18N | **PASS** |
| Mobile UX | **PASS** (source) |
| Notification | **DEFERRED** |
| Tests | Rating unit **PASS=24 FAIL=0**. Reporting unit **PASS=5 FAIL=0**. Leave regression **PASS=12 FAIL=0**. Mobile `tsc --noEmit` **PASS**. |
| Production | **UNTOUCHED** |
| Staging | **UNCHANGED** |
| Physical device | **NOT TESTED** |

---

## Rating

**PASS** (source). Server logic tidak diubah.

Flow di `mobile/app/(tabs)/rating.tsx` memakai API existing:

1. Reviewer membuka tugas (`GET /api/hr/rating/tasks/:id`).
2. Judul form = **nama subject** dari expand assignment (bukan identitas reviewer).
3. Lima aspek dari server; skor 1–5; komentar opsional.
4. Submit = `PUT` draft lalu `POST { action: "submit" }`.
5. Setelah submit, status server `locked`. UI menonaktifkan skor/komentar, menyembunyikan tombol kirim, menampilkan `rating.lockedHint`.
6. Resubmit ditolak oleh API existing (`Sudah dikirim dan terkunci.` → i18n `rating.alreadyLocked`).
7. Tab hasil memakai `GET /api/hr/rating/my-result` (server sudah strip identitas reviewer). UI tidak merender field reviewer.

`mobile/lib/hr-rating-api.ts` memakai `safeFetch`. Gagal jaringan → sentinel, bukan `HTTP ${status}`. Pesan teknis (`EXPO_PUBLIC_*`, URL, HTTP mentah) dipetakan di `mobile/lib/mobile-api-error.ts`.

---

## Reporting

**PASS** (source).

Employee dapat: buka Laporan (`/reports`) → isi judul/uraian/kategori/prioritas/lokasi → kamera → galeri → preview → hapus bukti sebelum submit → submit. API: `/api/hr/reports` existing.

Tile **Laporan Saya** tetap di Meja kerja untuk semua user yang punya tile personal (bukan HR-only).

---

## Findings

**PASS** (source).

HR/Owner: buka Temuan (`/findings`) → buat → isi → bukti gambar → preview → hapus sebelum submit → submit → lihat kembali sesuai RBAC API existing.

Employee: tile Temuan **tidak** di menu personal. `mobile/app/findings/_layout.tsx` tetap `canAccessHrNativeModule` → redirect `/reports`. Tidak ada akses HR-only untuk employee.

---

## Attachment

**PASS** (source). Validasi server tetap sumber kebenaran (`lib/hr/reporting-validate.ts` tidak diubah).

| Rule | Client | Server |
| --- | --- | --- |
| Maks 5 | `EVIDENCE_MAX_COUNT` + UI | `REPORTING_MAX_ATTACHMENTS` |
| JPEG / PNG / WebP | `validateEvidenceAsset` menolak HEIC/HEIF jika MIME masih HEIC | sniff magic bytes |
| Maks 10 MB/file | cek `fileSize` jika picker menyediakannya | `REPORTING_MAX_FILE_BYTES` |
| Bukan base64 | `FormData` file URI | unchanged |
| Bukan public upload | Bearer pada POST | auth-gated |
| URL butuh authorization | `reportingFileSource()` header Bearer | unchanged |

Picker iOS: `preferredAssetRepresentationMode: Compatible` (library tetap `expo-image-picker`) agar HEIC lebih sering menjadi JPEG. Jika MIME sudah JPEG/PNG/WebP, nama file `.heic` tidak ditolak.

Tidak ada `expo-document-picker` (bukan gap yang boleh ditambah library baru).

---

## Camera

**PASS** (source).

- Izin: `requestCameraPermissionsAsync` sebelum `launchCameraAsync`.
- Cancel (`shot.canceled`) → return, tanpa error.
- Preview: thumbnail + modal.
- Copy izin kamera vs galeri dipisah.
- `app.json`: `NSCameraUsageDescription` mencakup laporan/temuan.

Perangkat nyata: **NOT TESTED**.

---

## Gallery

**PASS** (source).

- Izin: `requestMediaLibraryPermissionsAsync`; ditolak → `reporting.galleryDenied` (bukan copy kamera).
- iOS: `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription` di `app.json`.
- Plugin `expo-image-picker` tidak diganti.
- Pilih gambar → validasi klien → upload → preview.

Perangkat nyata: **NOT TESTED**.

---

## I18N

**PASS** untuk permukaan Phase 15B (Rating, Reporting, Findings, attachment, camera/gallery, error/loading terkait).

Katalog `mobile/lib/i18n.tsx` ID/EN. Layout laporan/temuan, placeholder, status, empty, locked, offline memakai kunci katalog.

Tidak boleh muncul di UI Rating/Reporting/Findings (dicegah di mapper):

- `EXPO_PUBLIC_*`
- URL internal
- `HTTP 400` / sejenis

Nama tab teknis **Rating** tetap `rating.tabLabel` = `Rating` (bukan dipaksa terjemahan panjang).

Catatan (di luar gap 15B, tidak di-rewrite): Cuti, Lembur, Profil, WMS, Inventory masih banyak string ID hardcoded. Tidak diubah agar tidak melebar dari gap.

---

## Mobile UX

**PASS** (source only).

Diperbaiki karena ada di source Phase 15:

- Form laporan/temuan: `KeyboardAvoidingView` + `paddingBottom` dari safe-area insets (notch / home indicator).
- Keyboard: `keyboardShouldPersistTaps` + `keyboardDismissMode`.
- Chip kategori/prioritas `minHeight` 48.
- Loading/error/empty pada list & detail.
- Viewer close mengikuti `insets.top`.
- Rating: form locked; submit tidak menutupi alur (tetap di dalam ScrollView + offset keyboard).

Ionicons dan brand assets **tidak** diganti.

Perangkat nyata (overflow 320px, keyboard overlay fisik): **NOT TESTED**.

---

## Notification

**DEFERRED**

Tidak ada sistem notifikasi baru. Tidak ada mock yang terlihat production-ready.

Yang sudah ada tetap: izin + handler `mobile/lib/notifications.ts`. Token Expo hanya jika `EXPO_PUBLIC_EAS_PROJECT_ID` terisi — **tidak** di-set di `eas.json` / `mobile/.env`. Push UAT bukan bagian Phase 15B.

---

## Environment

**Tidak diubah.**

Checkout `mobile/.env` (gitignored):

- ERP: `https://staging.serba.space`
- PB: `https://pb-staging.serba.space`

Tidak dipakai untuk UAT HP (dan tidak di-set di `.env` checkout): `localhost`, `127.0.0.1`, `pb.serba.space`, `:8091`.

`eas.json` profil `production` **tidak** dijalankan.

---

## Tests

Dijalankan existing saja. Tidak ada test baru.

| Command | Result |
| --- | --- |
| `node scripts/test-hr-rating-unit.mjs` | **PASS=24 FAIL=0** |
| `node scripts/test-hr-reporting-unit.mjs` | **PASS=5 FAIL=0** |
| `node scripts/test-hr-wave2-leave.mjs` | **PASS=12 FAIL=0** (unit + unauth HTTP ke Next Local `:3000`; staging write-lock probe SKIPPED karena tidak ada `POCKETBASE_STAGING_URL`) |
| `cd mobile && npm run typecheck` | **PASS** |

Gagal karena perubahan mobile: tidak ada.

---

## Production / Staging / Device

| Item | Status |
| --- | --- |
| Production | **UNTOUCHED** |
| Staging | **UNCHANGED** |
| Physical device | **NOT TESTED** |

---

## STOP

Menunggu Owner review sebelum Mobile Build / UAT perangkat.

Tidak ada build. Tidak ada deploy. Tidak ada production.
