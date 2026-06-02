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

async function erpPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetchWithRetry(`${requireErpUrl()}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { ok: boolean; error?: string; data?: T };
  if (!res.ok || !json.ok) throw new Error(json.error || "Permintaan gagal.");
  return json.data as T;
}

async function erpGet<T>(path: string): Promise<T> {
  const res = await fetchWithRetry(`${requireErpUrl()}${path}`, { headers: authHeaders() });
  const json = (await res.json()) as { ok: boolean; error?: string; data?: T };
  if (!res.ok || !json.ok) throw new Error(json.error || "Permintaan gagal.");
  return json.data as T;
}

export async function createPackingSessionMobile(input: {
  packing_station_id: string;
  order_ref: string;
  lines: { product: string; expected_qty: number }[];
}) {
  return erpPost<{ id: string }>("/api/inventory/packing/sessions", {
    ...input,
    device_platform: "mobile",
  });
}

export async function scanPackingMobile(sessionId: string, barcode: string) {
  return erpPost<{ productName: string }>(`/api/inventory/packing/sessions/${sessionId}/scan`, {
    barcode,
  });
}

export async function completePackingMobile(sessionId: string, postOut?: boolean) {
  return erpPost<unknown>(`/api/inventory/packing/sessions/${sessionId}/complete`, {
    post_out: postOut,
  });
}

export async function fetchPackingDetailMobile(sessionId: string) {
  return erpGet<{ session: unknown; lines: unknown[] }>(
    `/api/inventory/packing/sessions/${sessionId}`
  );
}

export async function submitOpnameLineMobile(
  sessionId: string,
  lineId: string,
  countedQty: number
) {
  return erpPost<unknown>(`/api/inventory/opname/sessions/${sessionId}/count`, {
    line_id: lineId,
    counted_qty: countedQty,
  });
}

export async function fetchOpnameDetailMobile(sessionId: string) {
  return erpGet<{ session: { id: string; opname_no?: string; status?: string }; lines: Array<{ id: string; system_qty: number; counted_qty?: number; variance_qty?: number; expand?: { product?: { sku?: string; name?: string } } }> }>(
    `/api/inventory/opname/sessions/${sessionId}`
  );
}

export async function createMovementDraftMobile(input: {
  movement_type: "IN" | "OUT";
  warehouse: string;
  notes?: string;
  lines: { product: string; qty: number }[];
}) {
  return erpPost<{ id: string; movement_no?: string }>("/api/inventory/movements", {
    ...input,
    device_platform: "mobile",
  });
}
