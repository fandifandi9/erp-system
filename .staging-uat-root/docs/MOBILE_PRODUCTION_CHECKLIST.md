# Checklist produksi — Expo mobile (SERBA ERP)

Gunakan sebelum **EAS Build** / upload Play Store.

## Lingkungan

- [ ] `EXPO_PUBLIC_POCKETBASE_URL` & `EXPO_PUBLIC_ERP_WEB_URL` di **`mobile/eas.json`** (`build.base.env`) — wajib untuk APK EAS (`.env` tidak ikut Git).
- [ ] `mobile/.env` sama dengan `eas.json` (dev lokal).
- [ ] `EXPO_PUBLIC_PB_DISABLE_REALTIME=true` jika `/api/realtime` sering putus di jaringan Anda (HTTP2/proxy).
- [ ] PocketBase: field `session_nonce` pada `users` + rule update sendiri (untuk `registerMobileSessionAfterAuth`).

## Build

- [ ] `cd mobile && npx expo-doctor` tanpa error fatal.
- [ ] `newArchEnabled: true` di `app.json` (wajib untuk **Reanimated 4** / EAS Android).
- [ ] `npm install` di `mobile/` setelah perubahan `package.json` (lockfile segar).
- [ ] Root Next: `npm run build` sukses (CI / pra-rilis).

## Keamanan

- [ ] Jangan commit `.env` / kredensial admin PB ke mobile.
- [ ] `POCKETBASE_ADMIN_*` hanya di server Next, bukan di app.

## Operasional gudang

- [ ] User staf punya `inventory_role` ≠ `none` jika pakai modul inventory mobile.
- [ ] URL Next API dapat dijangkau dari jaringan operator HP (firewall / DNS).

## Uji cepat di perangkat

- [ ] Login → tidak blank putih lama (splash / “Memuat sesi…” hilang &lt; ~1s normal).
- [ ] Absensi GPS + foto.
- [ ] Inventory: scan zona (kamera) atau manual payload.
- [ ] Cek stok: scan barcode.
- [ ] Mode pesawat: app tidak freeze; pesan error / retry, tidak loop crash.

## Dukungan

- Satu jalur mobile: **Expo** (`mobile/`). Bukan Capacitor + Expo ganda.
