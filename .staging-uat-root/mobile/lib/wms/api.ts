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
      "EXPO_PUBLIC_ERP_WEB_URL belum diset di mobile/.env (mis. http://192.168.1.6:3000 untuk dev).",
    );
  }
  return base;
}

export type WorkstationSessionMobile = {
  id: string;
  userId: string | null;
  workstation: {
    id: string;
    code: string;
    name: string;
    location: string;
    cctv: string;
  };
  channel: string;
  bonusEligible: boolean;
  checkInAt: string;
  needsBind: boolean;
};

export async function fetchActiveWorkstationSessionMobile(): Promise<WorkstationSessionMobile | null> {
  const res = await fetchWithRetry(
    `${requireErpUrl()}/api/wms/workstations/sessions/active`,
    { headers: authHeaders() },
  );
  const json = (await res.json()) as {
    ok: boolean;
    data?: WorkstationSessionMobile | null;
    error?: string;
  };
  if (!res.ok || !json.ok) throw new Error(json.error || "Gagal memuat sesi meja.");
  return json.data ?? null;
}

export async function workstationCheckInMobile(desk_input: string) {
  const res = await fetchWithRetry(`${requireErpUrl()}/api/wms/workstations/checkin`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ desk_input: desk_input.trim(), channel: "mobile" }),
  });
  const json = (await res.json()) as {
    ok: boolean;
    error?: string;
    data?: WorkstationSessionMobile;
  };
  if (!res.ok || !json.ok) throw new Error(json.error || "Check-in meja gagal.");
  return json.data;
}

export async function workstationCheckOutMobile(sessionId: string) {
  const res = await fetchWithRetry(`${requireErpUrl()}/api/wms/workstations/checkout`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ session_id: sessionId }),
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error || "Check-out meja gagal.");
}
