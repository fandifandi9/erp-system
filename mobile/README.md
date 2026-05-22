# ERP Staff (Expo)

Aplikasi **native** untuk staf: login PocketBase, absensi GPS, HR antrean, **inventory (scan zona, cek stok)**, profil, push.

**Jalur rilis mobile resmi:** folder ini + **EAS Build** / `expo run:android`.  
**Bukan** shell Capacitor di root repo (Capacitor + folder `android/` root telah dihapus agar tidak bentrok).

## Arsitektur (ringkas)

- **PocketBase:** auth + sebagian besar data (`EXPO_PUBLIC_POCKETBASE_URL`).
- **Next.js (hanya API inventory zona):** `EXPO_PUBLIC_ERP_WEB_URL` — lihat `../docs/MOBILE_ARCHITECTURE.md`.

## Struktur

- `app/` — Expo Router: `(auth)/login`, `(tabs)/`, `hr/`, `inventory/`.
- `lib/` — PocketBase (`pocketbase.ts` + SecureStore), domain (`attendance.ts`, …), `network.ts` (retry), `inventory/` (API bridge + stok PB).
- `context/auth.tsx` — sesi, MFA, `session_nonce`, realtime/polling sesi.

## Setup

1. Salin `mobile/.env.example` → `.env` (untuk `expo start` di laptop).
2. Wajib di `.env` (dev) **dan** di `eas.json` → `build.base.env` (APK EAS — `.env` tidak ikut Git):
   - `EXPO_PUBLIC_POCKETBASE_URL` — HTTPS PocketBase, tanpa slash akhir.
   - `EXPO_PUBLIC_ERP_WEB_URL` — URL **Next.js** (production HTTPS; dev bisa `http://IP-LAN-PC:3000`).
3. `npm install` di folder ini.
4. `npx expo start` — Expo Go atau dev client.

## Build APK (EAS)

Dari folder `mobile/`:

```bash
eas build --platform android --profile preview-apk --clear-cache
# atau production:
eas build --platform android --profile production --clear-cache
```

Variabel `EXPO_PUBLIC_*` untuk cloud build ada di **`eas.json`** (profil `base`). Setelah ganti domain, edit `eas.json` lalu build ulang.

Di layar login APK, harus tampil **Server: https://…** (bukan peringatan oranye).

Opsional:

- `EXPO_PUBLIC_PB_DISABLE_REALTIME=true` — jika SSE `/api/realtime` sering error di jaringan Anda.
- `EXPO_PUBLIC_EAS_PROJECT_ID` — push notification (EAS + FCM/APNs).

## Checklist produksi

Lihat **`../docs/MOBILE_PRODUCTION_CHECKLIST.md`**.

## Keamanan

- Token di **expo-secure-store** (AsyncAuthStore).
- Jangan sertakan `POCKETBASE_ADMIN_*` di app mobile.

## Catatan selfie / kamera

Absensi & inventory scan memakai `expo-camera`; izin sudah di `app.json`.
