import { pb } from "@/lib/pocketbase";
import { getErpWebUrl } from "@/lib/inventory/env";

export type OtApiResult = { success: boolean; message: string; id?: string };

function requireErpUrl(): string {
  const base = getErpWebUrl();
  if (!base) {
    throw new Error("EXPO_PUBLIC_ERP_WEB_URL belum diset (API lembur).");
  }
  return base;
}

async function otPost(path: string, body?: Record<string, unknown>): Promise<OtApiResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  const res = await fetch(`${requireErpUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    message?: string;
    id?: string;
  };
  const message = json.message || json.error || (res.ok ? "OK" : `HTTP ${res.status}`);
  if (!res.ok || json.ok === false) return { success: false, message };
  return { success: true, message, id: json.id };
}

export async function mobileSubmitOvertime(input: {
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  reason?: string;
}): Promise<OtApiResult> {
  return otPost("/api/hr/overtime", input);
}

export async function mobileApproveOvertime(id: string): Promise<OtApiResult> {
  return otPost(`/api/hr/overtime/${encodeURIComponent(id)}/approve`, {});
}

export async function mobileRejectOvertime(id: string, reason: string): Promise<OtApiResult> {
  return otPost(`/api/hr/overtime/${encodeURIComponent(id)}/reject`, { reason });
}
