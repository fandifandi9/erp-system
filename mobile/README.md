# ERP Staff (Expo)

Aplikasi native untuk staf: login PocketBase, absensi GPS (logika selaras dengan `../lib/attendance.ts` di web), cuti, aktivitas luar kantor, profil, dan dasar push notification.

## Struktur

- `app/` — Expo Router: `(auth)/login`, tab `(tabs)/` (absensi, cuti, luar kantor, profil).
- `lib/` — `pocketbase` (AsyncAuthStore + SecureStore), `attendance.ts`, `leave.ts`, `field_activity.ts`, `notifications.ts`, `gps.ts`, `location.ts`, `device.ts`.
- `context/auth.tsx` — sesi, `signInWithPassword` / `signInWithOtp` (MFA), `signOut`, rotasi `session_nonce`, realtime logout jika sesi diganti perangkat lain.

## Setup

1. Salin `.env.example` ke `.env` dan set `EXPO_PUBLIC_POCKETBASE_URL` ke URL HTTPS PocketBase (tanpa slash akhir).
2. `npm install` di folder ini.
3. `npx expo start` — scan QR dengan Expo Go, atau build dev client / production lewat EAS.

Variabel opsional:

- `EXPO_PUBLIC_EAS_PROJECT_ID` — untuk `getExpoPushTokenAsync` (push penuh perlu project EAS + FCM/APNs).

## Keamanan (ringkas)

- Token PocketBase disimpan lewat `AsyncAuthStore` + **expo-secure-store** (bukan password).
- Logout memanggil `authStore.clear()` sehingga token dihapus dari SecureStore.
- Sandi tidak disimpan di perangkat.
- Pakai HTTPS ke PocketBase; pertimbangkan pinning sertifikat untuk threat model tinggi.
- Pastikan aturan API PocketBase untuk koleksi `users`, `profiles`, `attendance_logs`, `leave_requests`, `field_activity_requests` mengizinkan peran staf sesuai web.

## Catatan selfie

Layar absensi mengambil foto opsional; unggah ke rekaman PB dapat ditambahkan setelah ada field file di skema `attendance_logs` atau endpoint kustom.
