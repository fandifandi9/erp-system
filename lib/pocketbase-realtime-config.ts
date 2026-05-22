/**
 * Saat reverse proxy/CDN memutus stream `/api/realtime` (mis. ERR_INCOMPLETE_CHUNKED_ENCODING),
 * aktifkan env di bawah agar tidak memanggil `subscribe` dan sinkronisasi sesi lewat polling.
 *
 * Perbaikan permanen: konfigurasi Nginx/Caddy (buffering off, timeout panjang) untuk path realtime.
 */

function truthyEnv(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

/** Next (`NEXT_PUBLIC_*`) atau Expo (`EXPO_PUBLIC_*`). */
export function pocketBaseRealtimeDisabled(): boolean {
  if (typeof process === "undefined") return false;
  return (
    truthyEnv(process.env.NEXT_PUBLIC_PB_DISABLE_REALTIME) ||
    truthyEnv(process.env.EXPO_PUBLIC_PB_DISABLE_REALTIME)
  );
}

/** Interval polling verifikasi user (ms), default 30_000, clamp 5s–5m. */
export function pocketBaseSessionPollIntervalMs(): number {
  if (typeof process === "undefined") return 30_000;
  const raw =
    process.env.NEXT_PUBLIC_PB_SESSION_POLL_MS ??
    process.env.EXPO_PUBLIC_PB_SESSION_POLL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30_000;
  return Math.min(300_000, Math.max(5_000, n));
}
