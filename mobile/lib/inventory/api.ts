import { pb } from "@/lib/pocketbase";
import { getErpWebUrl } from "@/lib/inventory/env";
import { fetchWithRetry } from "@/lib/network";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

function requireErpUrl(): string {
  const base = getErpWebUrl();
  if (!base) {
    throw new Error(
      "EXPO_PUBLIC_ERP_WEB_URL belum diset di mobile/.env (mis. http://192.168.1.6:3000 untuk dev)."
    );
  }
  return base;
}

export type ZoneSessionActive = {
  id: string;
  status: string;
  check_in_at: string;
  warehouse: string;
  zone: string;
  expand?: {
    zone?: { code?: string; name?: string };
    warehouse?: { code?: string; name?: string };
  };
};

export async function fetchActiveZoneSession(): Promise<ZoneSessionActive | null> {
  const res = await fetchWithRetry(`${requireErpUrl()}/api/inventory/zones/sessions/active`, {
    headers: authHeaders(),
  });
  const json = (await res.json()) as {
    ok: boolean;
    data?: ZoneSessionActive | null;
    error?: string;
  };
  if (!res.ok || !json.ok) throw new Error(json.error || "Gagal memuat sesi zona.");
  return json.data ?? null;
}

export async function zoneCheckIn(input: { qr_payload?: string; zone_id?: string }) {
  const res = await fetchWithRetry(`${requireErpUrl()}/api/inventory/zones/checkin`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { ok: boolean; error?: string; data?: unknown };
  if (!res.ok || !json.ok) throw new Error(json.error || "Check-in gagal.");
  return json.data;
}

export async function zoneCheckOut(sessionId?: string) {
  const res = await fetchWithRetry(`${requireErpUrl()}/api/inventory/zones/checkout`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error || "Check-out gagal.");
}
