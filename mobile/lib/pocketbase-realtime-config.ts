/**
 * Samakan perilaku dengan `lib/pocketbase-realtime-config.ts` di root web.
 * Saat proxy memutus `/api/realtime`, set EXPO_PUBLIC_PB_DISABLE_REALTIME.
 */

function truthyEnv(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

export function pocketBaseRealtimeDisabled(): boolean {
  if (typeof process === "undefined") return false;
  return truthyEnv(process.env.EXPO_PUBLIC_PB_DISABLE_REALTIME);
}

export function pocketBaseSessionPollIntervalMs(): number {
  if (typeof process === "undefined") return 30_000;
  const n = Number(process.env.EXPO_PUBLIC_PB_SESSION_POLL_MS);
  if (!Number.isFinite(n)) return 30_000;
  return Math.min(300_000, Math.max(5_000, n));
}
