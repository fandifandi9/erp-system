# Arsitektur mobile (Expo) vs web (Next.js) — SERBA ERP

Dokumen ini menjelaskan **aliran data** dan **batas tanggung jawab** setelah cleanup produksi. Baca sebelum menambah fitur gudang / inventory.

## Ringkasan

| Platform | Peran utama | Backend |
|----------|----------------|----------|
| **Next.js (web)** | Dashboard admin, HR web, inventory master, movement post via API | PocketBase + cookie `pb_auth` |
| **Expo (mobile)** | Absensi, HR native, operasi lapangan (scan zona, cek stok) | PocketBase langsung + **beberapa** panggilan Next API |
| **PocketBase** | Sumber kebenaran data, auth, rules | — |

## Native mobile (tanpa Next runtime)

- UI, navigasi, kamera, lokasi, secure storage, push (Expo).
- Login / refresh auth user lewat **PocketBase JS SDK** (`mobile/lib/pocketbase.ts`).
- **Cek stok produk**: `mobile/lib/inventory/stock.ts` → koleksi PB `inv_products`, `inv_product_barcodes`, `inv_stock_balances`.

## Server-side / “web bridge” (Next API)

Operasi yang butuh **kredensial admin PB** atau logika terpusat di server:

- **Check-in / check-out zona**: `mobile/lib/inventory/api.ts` → `EXPO_PUBLIC_ERP_WEB_URL` + `/api/inventory/zones/*`
- **Posting movement stok** (di web): `app/api/inventory/movements/*/post`

**Alasan:** rule PB / keamanan (balance, admin) tidak diduplikasi di klien mobile.

## Antrean offline (outbox ringan)

Operasi lapangan yang gagal karena jaringan dapat **di-antrekan lokal** lalu di-replay otomatis. Lihat **[MOBILE_OFFLINE_QUEUE.md](./MOBILE_OFFLINE_QUEUE.md)**.

## Bridge browser (bukan hybrid app)

- `/mobile-bridge` (Next): sinkron token native → cookie web agar user bisa buka dashboard di **browser luar app**.

## Environment

| Variabel | Dipakai di |
|----------|------------|
| `EXPO_PUBLIC_POCKETBASE_URL` | Mobile → PB |
| `EXPO_PUBLIC_ERP_WEB_URL` | Mobile → Next API inventory zona (HTTPS / LAN saat dev) |
| `NEXT_PUBLIC_POCKETBASE_URL` | Web → PB |
| `POCKETBASE_ADMIN_*` | **Hanya server Next** (`.env.local`, jangan ke mobile) |

Mobile **tidak** membaca `NEXT_PUBLIC_*`. Web **tidak** membaca `EXPO_PUBLIC_*`.

## Realtime PocketBase (mobile)

- `mobile/lib/pocketbase-realtime-config.ts` — jika proxy memutus SSE, set `EXPO_PUBLIC_PB_DISABLE_REALTIME=true` → sesi diverifikasi lewat **polling** (`mobile/context/auth.tsx`).
- Subscribe realtime user: **per record id** (bukan `*`) untuk mengurangi beban; gagal subscribe → fallback polling.

## Offline

- Retry ringkas untuk fetch Next API: `mobile/lib/network.ts` (`fetchWithRetry`).
- Offline penuh / sync antrian: fondasi di `inv_sync_outbox` (PB) — implementasi UI menyusul; gunakan retry + pesan error untuk saat ini.

## Yang dihapus dari repo (jalur tunggal Expo)

- **Capacitor** (dependency + `capacitor.config.ts` + folder `android/` Capacitor di root) — jalur mobile resmi = **folder `mobile/`** (EAS / `expo run:android`).

## Checklist produksi

Lihat **`docs/MOBILE_PRODUCTION_CHECKLIST.md`**.
