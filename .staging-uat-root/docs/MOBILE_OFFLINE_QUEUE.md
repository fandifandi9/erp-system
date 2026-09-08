# Antrean offline ringan (mobile Expo)

Aplikasi operasional memakai **outbox lokal** (`AsyncStorage`) agar aksi penting tidak hilang saat Wi‑Fi / sinyal putus sebentar. Ini **bukan** mode ERP offline penuh: hanya **menunda kirim** ke PocketBase / API Next sampai jaringan pulih.

## Perilaku

- Item antrean: `type`, `payload`, `created_at`, `retry_count`, `status` (`pending` | `failed`), `idempotency_key`, `request_id`, `device_id` (jika tersedia), `next_attempt_at` (backoff).
- **Sinkron otomatis** saat: NetInfo mendeteksi online, app kembali `active`, interval ringan jika masih ada `pending`, serta setelah enqueue (via notifier UI).
- **Backoff eksponensial** + batas retry (`OFFLINE_QUEUE_MAX_RETRIES` di `mobile/lib/offline-queue/types.ts`).
- **Logout** mengosongkan antrean perangkat (hindari bocor antar akun di perangkat bersama).

## Tipe yang diproses

| Tipe | Sumber | Catatan |
|------|--------|--------|
| `attendance_checkin` | `lib/attendance.ts` | Hanya tanpa **selfie**; dengan selfie tetap butuh online. Dedupe server: `user` + `date`. |
| `attendance_checkout` | `lib/attendance.ts` | Perlu `record_id` hari ini (sudah ter-load saat online). Dedupe: `att_co_{record_id}`. |
| `inventory_zone_checkin` | `lib/inventory/offline-resilient.ts` | Replay ke API Next seperti online. |
| `inventory_zone_checkout` | idem | `session_id` disarankan; tanpa session kunci idempotency lemah. |
| `opname_line`, `packing_scan`, `activity_metadata` | Siap dipakai dari kode fitur | Best-effort `inv_staff_activities` di PocketBase; jika koleksi tidak ada (404), item dihapus tanpa error. |

## UI

`OfflineQueueProvider` (`mobile/context/offline-queue.tsx`) menampilkan strip tipis di **atas** layar (aman area): Offline / Menunggu sinkron / Sinkron OK / Antrean gagal.

## API untuk fitur baru

```ts
import { enqueueOfflineItem } from "@/lib/offline-queue/enqueue";

await enqueueOfflineItem({
  type: "activity_metadata",
  payload: { /* body PB / metadata */ },
  idempotency_key: "unik_stabil_per_aksi",
});
```

Pastikan `idempotency_key` stabil untuk aksi yang sama (hindari double movement).

## Dependensi

- `@react-native-async-storage/async-storage`
- `@react-native-community/netinfo`

Pasang dengan `npx expo install @react-native-async-storage/async-storage @react-native-community/netinfo` agar versi selaras SDK Expo.
