import { pb } from "@/lib/pocketbase";
import { getErpWebUrl } from "@/lib/inventory/env";

export type FieldApiResult = { success: boolean; message: string; id?: string };

function requireErpUrl(): string {
  const base = getErpWebUrl();
  if (!base) throw new Error("EXPO_PUBLIC_ERP_WEB_URL belum diset (API izin/field).");
  return base;
}

async function fieldPost(path: string, body?: Record<string, unknown>): Promise<FieldApiResult> {
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

export async function mobileSubmitFieldActivity(input: {
  start_date: string;
  end_date: string;
  activity_type?: string;
  destination?: string;
  reason?: string;
}): Promise<FieldApiResult> {
  return fieldPost("/api/hr/field-activity", input);
}

export async function mobileApproveFieldActivity(id: string): Promise<FieldApiResult> {
  return fieldPost(`/api/hr/field-activity/${encodeURIComponent(id)}/approve`, {});
}

export async function mobileRejectFieldActivity(id: string, reason: string): Promise<FieldApiResult> {
  return fieldPost(`/api/hr/field-activity/${encodeURIComponent(id)}/reject`, { reason });
}
