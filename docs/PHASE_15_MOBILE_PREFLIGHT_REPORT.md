# PHASE 15 — Mobile Pre-Flight Audit

**Date:** 2026-08-27  
**Mode:** AUDIT / PREPARATION ONLY — no build, no deploy, no schema change, no business-logic change.

Mobile project:  
`B:\Coding\erp-system\mobile` (Expo Router / EAS). **Bukan** `app/` di root repo — itu Next.js web.

Environment:  
Checkout `mobile/.env` saat ini mengarah ke **staging** (`https://staging.serba.space` + `https://pb-staging.serba.space`). Bukan production. Bukan `127.0.0.1`.

Production safety:  
Kode mobile **tidak** hardcode `pb.serba.space` atau `:8091`. Risiko operator: profil EAS `production` **memuat** production URL jika seseorang menjalankan `eas build --profile production`. Profil `development` memakai `http://localhost:3000` (HP tidak bisa akses loopback laptop).

Feature matrix:

| Area | Status |
| --- | --- |
| Login | PASS |
| Attendance | PASS |
| GPS | PASS |
| Rating | PARTIAL |
| Reporting | PASS |
| Findings | PASS |
| Camera | PASS |
| Gallery | PASS |
| Attachments | PARTIAL |
| Notification | PARTIAL |
| Logout | PASS |

UI/UX:  
CONDITIONAL

Build readiness:  
CONDITIONAL

Physical device:  
NOT TESTED

Production:  
UNTOUCHED

Staging:  
UNCHANGED

---

## 1. Mobile project

**Source of truth:** `mobile/` (Expo SDK ~54, `expo-router`, `main`: `expo-router/entry`).

| Item | Path / value |
| --- | --- |
| App name | SERBA System (`mobile/app.json`) |
| Slug | `erp-staff-mobile` |
| Scheme | `serbasystem` |
| Version | 1.0.0 |
| Icon / splash | `mobile/assets/systemLogo.png` (iOS icon: `systemLogoIos.png`) |
| Notification icon | `mobile/assets/notificationIcon.png` |
| Branding login | `mobile/lib/branding.ts` → `systemLogoWide.png` |
| Bundle / package | `com.erp.staff` |
| EAS projectId | `4645bf17-9b30-440a-bebb-8f4c73ce1105` (`app.json` extra.eas) |
| Config merge | `mobile/app.config.js` membaca `EXPO_PUBLIC_*` ke `extra.pocketBaseUrl` / `extra.erpWebUrl` |
| EAS | `mobile/eas.json` |
| Env example | `mobile/.env.example` |
| Env local (gitignored via root `.env*`) | `mobile/.env` |

**Bukan** aplikasi mobile: `app/` (Next.js), `.staging-uat-root/mobile/` (salinan overlay, bukan source Local yang di-audit).

### API (Next.js)

Mobile memanggil Next API untuk Rating, Laporan/Temuan, Absensi (server path), inventory zona, dll. via `EXPO_PUBLIC_ERP_WEB_URL`.

Fungsi: `getErpWebUrl()` / `requireErpWebUrl()` di `mobile/lib/env.ts` (baris 22–47). Tidak ada fallback host jika kosong — string kosong atau error `ERP server URL belum dikonfigurasi.`

**Nilai saat ini (`mobile/.env`):** `https://staging.serba.space`

### PocketBase

Auth + data PB via `EXPO_PUBLIC_POCKETBASE_URL`. Client: `mobile/lib/pocketbase.ts` → `resolvePocketBaseUrl()` (baris 48–61). Jika URL kosong **atau** loopback di **release**: memakai `https://unconfigured.invalid` (bukan 127.0.0.1).

**Nilai saat ini (`mobile/.env`):** `https://pb-staging.serba.space`

Auth: PocketBase JS SDK + `expo-secure-store` (`AsyncAuthStore`). Sesi: `mobile/context/auth.tsx`. Login UI: `mobile/app/(auth)/login.tsx`.

---

## 2. Environment safety

**Tidak diubah.** Temuan dicatat saja.

### Tidak ada di source executable

Tidak ada literal `127.0.0.1:8091`, `127.0.0.1:8092`, atau `pb.serba.space` di `.ts`/`.tsx` mobile. Tidak ada fallback diam-diam ke production PB.

### Loopback / localhost (potensi salah di HP)

| File | Baris | Fungsi / konteks | Environment yang dimaksud |
| --- | --- | --- | --- |
| `mobile/lib/env.ts` | 7–13 | `isLoopbackUrl()` | Deteksi `localhost` / `127.0.0.1` / `0.0.0.0` / `::1` |
| `mobile/lib/env.ts` | 26–31 | `rejectLoopbackInRelease()` | **Release:** URL loopback dikosongkan (HP tidak boleh pakai 127.0.0.1) |
| `mobile/lib/env.ts` | 34–39 | `requirePocketBaseUrl()` | Fail-fast jika kosong setelah reject loopback |
| `mobile/lib/pocketbase.ts` | 48–58 | `resolvePocketBaseUrl()` | `__DEV__` boleh loopback; release → `unconfigured.invalid` |
| `mobile/.env.example` | 5 | Komentar | Dev Expo+Next di mesin yang sama: `http://localhost:3000` |
| `mobile/.env.example` | 7 | Komentar | Peringatan: jangan `127.0.0.1:8090` di release |
| `mobile/.env.example` | 14–15 | Komentar | Production: `https://serba.space` / `https://pb.serba.space` |
| `mobile/eas.json` | 12–18 | Profil `development` | `EXPO_PUBLIC_ERP_WEB_URL=http://localhost:3000` — **HP fisik tidak bisa** ke localhost laptop. **PB URL tidak di-set** di profil ini (bergantung env mesin build). |
| `mobile/eas.json` | 20–27 | Profil `staging` / `preview` | Staging HTTPS — cocok UAT perangkat |
| `mobile/eas.json` | 39–49 | Profil `production` | **`https://pb.serba.space` + `https://serba.space`** — sengaja production. Jangan dijalankan tanpa approval Owner |
| `mobile/lib/wms/api.ts` | ~15 | Pesan error | Contoh dev `http://192.168.1.6:3000` (LAN), bukan 127.0.0.1 |
| `mobile/lib/inventory/api.ts` | ~15 | Pesan error | Sama |

### Checkout Local saat ini

`mobile/.env` (tidak di Git):

- ERP: `https://staging.serba.space`
- PB: `https://pb-staging.serba.space`
- `EXPO_PUBLIC_PB_DISABLE_REALTIME=true`

Ini **aman** terhadap production PB. Untuk UAT HP: jaringan harus mencapai staging (bukan 8090 lokal). Uji Local PB dari HP membutuhkan IP LAN, bukan `127.0.0.1` — **belum** dikonfigurasi di `.env` saat ini.

### Operator risk (jangan dijalankan di phase ini)

```text
eas build --platform android --profile production
```

akan menanam URL production. Phase 15 **tidak** menjalankan perintah itu.

---

## 3. Feature coverage

Status: IMPLEMENTED / PARTIAL / MISSING — sumber saja, tidak menambah fitur.

| ID | Fitur | Status | Bukti |
| --- | --- | --- | --- |
| A | Login | IMPLEMENTED | `mobile/app/(auth)/login.tsx`, `context/auth.tsx` — password + MFA OTP, peringatan jika server URL kosong |
| B | Dashboard | IMPLEMENTED | Tab **Meja kerja** `mobile/app/(tabs)/kerja.tsx` + tile `lib/work-dashboard-menu.ts` |
| C | Attendance | IMPLEMENTED | Tab Absensi, `AttendanceCheckInPanel`, `lib/attendance.ts`, API `lib/hr-attendance-api.ts` |
| D | GPS | IMPLEMENTED | `expo-location`, `lib/location.ts`, `lib/gps.ts` (`validateGPSRadius`, akurasi, jump) |
| E | Rating | PARTIAL | Tab Rating memakai API existing; UI kunci setelah submit tidak menonaktifkan form; fetch tanpa wrapper offline khusus |
| F | Laporan & Temuan | IMPLEMENTED | `/reports` (semua user via tile Laporan Saya); `/findings` (HR/Owner tile) |
| G | Camera | IMPLEMENTED | `expo-camera` + `expo-image-picker` `launchCameraAsync` (absensi + laporan) |
| H | Gallery | IMPLEMENTED | `launchImageLibraryAsync` di `MobileCaseForm` |
| I | Attachment upload | PARTIAL | Upload terautentikasi ada; **bukan** document picker; batas 10 MB hanya di server; HEIC iOS bisa ditolak sniff |
| J | Notification | PARTIAL | Izin + handler `lib/notifications.ts`; token Expo **hanya** jika `EXPO_PUBLIC_EAS_PROJECT_ID` terisi — **tidak** ada di `eas.json` / `.env` |
| K | Logout | IMPLEMENTED | Profil → Keluar → `signOut()` → `/(auth)/login` |

---

## 4. Mobile reporting / findings

Source mendukung (tanpa mengubah logic):

| Syarat | Status | Catatan |
| --- | --- | --- |
| Camera | Ya | `MobileCaseForm.pick(true)` + izin kamera |
| Gallery | Ya | `pick(false)` + izin media library |
| File picker (dokumen generik) | **Tidak** | Tidak ada `expo-document-picker` di `package.json` |
| JPEG / PNG / WebP | Server ya | `lib/hr/reporting-validate.ts` sniff magic bytes; klien default `image/jpeg` |
| Maks 5 lampiran | Ya | Client `items.length >= 5`; server `REPORTING_MAX_ATTACHMENTS` |
| Maks 10 MB/file | Server ya | `REPORTING_MAX_FILE_BYTES`; **klien tidak cek ukuran** sebelum upload |
| Preview | Ya | Thumbnail + Modal zoom |
| Delete before submit | Ya | `mobileDeleteEvidence` pada draf |
| Authenticated upload | Ya | `Authorization: Bearer` di `hr-reporting-api.ts` |
| Authenticated viewer | Ya | `reportingFileSource()` menaruh header Bearer pada `Image` |
| Unauthorized ditolak | Ya (API) | `reporting-http.ts`: 401 tanpa sesi; `serverGetAttachmentRecord` 403 di luar scope |

Offline copy:

- ID: `Tidak ada koneksi. Laporan belum dikirim.` (`mobile/lib/i18n.tsx`, `reporting.offline`; sama di `hr-reporting-api.ts` konstanta `OFFLINE`)
- EN: `No connection. The report has not been sent.`

`safeFetch` melempar pesan itu jika `fetch` throw (tidak ada success palsu).

**PARTIAL:** HEIC dari kamera iOS biasanya gagal sniff (bukan JPEG/PNG/WebP) — error server, bukan success palsu. Tidak ada picker file non-gambar.

---

## 5. Attendance

Mobile memakai logic existing di `mobile/lib/attendance.ts` (tidak diubah di audit ini):

| Syarat | Ada? | Lokasi |
| --- | --- | --- |
| GPS required | Ya, jika rules `gpsRequired` dan bukan remote | `enforceGeo` / `strictRadius` ~516–550 |
| Location permission | Ya | `lib/location.ts` `requestForegroundPermissionsAsync`; plugin `expo-location` di `app.json` |
| Office radius | Ya | `validateGPSRadius` + `effectiveOfficeRadiusMeters` |
| Leave block | Ya | `hasApprovedLeaveToday` sebelum check-in (~493–497) |
| Tampering / suspicious | Ya | `detectSuspiciousGPSJump`, `is_suspicious` pada payload; akurasi GPS `enforceMaxGpsAccuracy` |
| Check-in / check-out | Ya | `checkIn` / `checkOut` → Next API jika configured |
| Offline fake success | **Tidak** | Gagal jaringan → `success: false`. Phase 11: offline absensi **tidak** di-replay (`offline-queue/processor.ts` throw) |

Izin iOS: `NSLocationWhenInUseUsageDescription` / Always di `app.json`. Android: `ACCESS_FINE_LOCATION` / `COARSE`.

---

## 6. Rating

Mobile **memakai API existing**, tidak menduplikasi kalkulasi:

| Syarat | Status | Sumber |
| --- | --- | --- |
| Task list | Ya | `GET /api/hr/rating/my-tasks` |
| 5 aspects | Ya (dari server) | Response `aspects`; UI chip 1–5 per aspek |
| Score 1–5 | Ya | `[1,2,3,4,5]` di `rating.tsx` |
| Comment | Ya | opsional per aspek |
| Submit | Ya | draft PUT lalu POST `{ action: "submit" }` |
| Locked after submit | API ya; UI PARTIAL | Label locked/submitted ada; form submit **tidak** di-disable untuk status locked (mengandalkan reject API) |
| My result privacy | Ya | Teks `rating.privacy` — identitas penilai / komentar individu tidak ditampilkan di tab hasil |

`hr-rating-api.ts` **tidak** memakai `safeFetch`: gagal jaringan bisa tampil sebagai error fetch generik, bukan kalimat offline laporan.

---

## 7. UI/UX pre-flight (source)

| Item | Temuan |
| --- | --- |
| Safe area / notch | `SafeAreaProvider` root; login `SafeAreaView` edges top+bottom; tab bar `insets.bottom` |
| Home indicator | Tab bar menambah padding bottom; form laporan `paddingBottom: 48` (bukan insets) |
| Keyboard | Login / rating / profil / case form: `KeyboardAvoidingView`; `keyboardShouldPersistTaps` |
| Scrolling | `ScrollView` di meja kerja, rating, laporan, profil |
| Button size | Banyak `minHeight` 48–52 (login, chips rating, tombol laporan) |
| Icon size | Tab Ionicons 22; brand `systemLogo*` — **tidak diganti** |
| Truncation | `numberOfLines` di tile, task rating, absensi |
| Horizontal overflow | Score row `flex: 1` + `minWidth: 48`; chip wrap di form laporan |
| Bottom action | Submit laporan di dalam scroll (bisa perlu scroll); tab bar tetap terlihat |
| Loading | Indicator di login boot, tabs, list laporan, rating |
| Error | Teks merah / Alert |
| Empty | `reporting.empty`, `rating.emptyResult`, `rating.emptyTasks`, riwayat absensi |

**CONDITIONAL:** tidak diuji di perangkat nyata (notch, keyboard overlay, overflow 320px). Form laporan tidak membungkus `SafeAreaView`. Izin galeri iOS mengandalkan plugin `expo-image-picker` (tidak ada `NSPhotoLibraryUsageDescription` eksplisit di `app.json` infoPlist — Expo prebuild biasanya menambahkannya).

Asset: Ionicons + `mobile/assets/systemLogo.png`, `systemLogoIos.png`, `systemLogoWide.png`, `notificationIcon.png`. Tidak diganti.

---

## 8. Offline behavior

| Alur | Success palsu? | Perilaku |
| --- | --- | --- |
| Laporan/temuan create/upload/submit | Tidak | `safeFetch` → pesan offline ID/EN |
| Absensi | Tidak | `success: false`; antrean absensi tidak di-replay |
| Rating | PARTIAL | Error tampil; pesan tidak distandarkan seperti laporan |
| Inventory zona | Antrean outbox **ada** (bukan absensi) — `lib/inventory/offline-resilient.ts` | Di luar scope A–K; tetap bukan “absen sukses palsu” |

Auth refresh gagal jaringan: **tidak** auto-logout (`auth.tsx` komentar offline).

---

## 9. Build readiness

**Perintah (tidak dijalankan di phase ini):**

```bash
cd mobile
npm install
npx expo start
npx expo run:android   # / ios
eas build --platform android --profile preview-apk   # staging URLs
```

| Item | Status |
| --- | --- |
| `package.json` scripts | `start`, `android`, `ios`, `web`, `typecheck` |
| `expo-camera` | ~17.0.10 + plugin `app.json` |
| `expo-image-picker` | ~17.0.11 |
| `expo-document-picker` | **Tidak terpasang** |
| `expo-location` | ~19.0.8 + plugin |
| `expo-notifications` | ~0.32.17 |
| `expo-secure-store` | ya |
| `expo-dev-client` | ya (profil development) |
| Native modules di plugins | camera, location, image-picker, notifications, datetimepicker, build-properties |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | **Tidak** di `eas.json` / `.env` — push token skip |
| Profil UAT yang aman | `staging` / `preview` / `preview-apk` → `pb-staging.serba.space` |
| Profil berbahaya tanpa approval | `production` → `pb.serba.space` |
| Profil tidak cocok HP | `development` → `localhost:3000` |

Production build **tidak** dilakukan.

---

## 10. Ringkasan keputusan untuk Owner

1. **UAT perangkat:** pakai EAS `preview-apk` / `staging` (sudah HTTPS staging), **bukan** `production`, **bukan** `development` (localhost).  
2. **Checkout Local `mobile/.env` sudah staging** — Expo Go di HP akan hit staging, bukan Local `:8090`.  
3. **Jangan** `eas build --profile production` sampai Owner setuju.  
4. Gap yang diketahui (tidak diperbaiki di Phase 15): file picker dokumen, cek 10 MB di klien, HEIC, push projectId, UI lock rating, safe area form laporan.

---

**STOP.** Menunggu Owner review.

Tidak ada production build. Tidak ada deploy. Schema dan business logic tidak diubah.
