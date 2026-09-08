import { pb } from "@/lib/pocketbase";
import { getErpWebUrl } from "@/lib/inventory/env";

function requireErpUrl(): string {
  const base = getErpWebUrl();
  if (!base) throw new Error("EXPO_PUBLIC_ERP_WEB_URL belum diset (API HR).");
  return base;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

async function hrGet(path: string): Promise<{ ok: boolean; items: Record<string, unknown>[]; error?: string }> {
  const res = await fetch(`${requireErpUrl()}${path}`, {
    method: "GET",
    headers: authHeaders(),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    items?: Record<string, unknown>[];
    error?: string;
  };
  if (!res.ok || json.ok === false) {
    return { ok: false, items: [], error: json.error || `HTTP ${res.status}` };
  }
  return { ok: true, items: Array.isArray(json.items) ? json.items : [] };
}

async function hrPost(
  path: string,
  body?: Record<string, unknown>,
): Promise<{ success: boolean; message: string; id?: string }> {
  const res = await fetch(`${requireErpUrl()}${path}`, {
    method: "POST",
    headers: authHeaders(),
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

export async function mobileFetchLeaveQueue() {
  return hrGet("/api/hr/leave?pendingForApprover=1");
}
export async function mobileFetchOvertimeQueue() {
  return hrGet("/api/hr/overtime?pendingForApprover=1");
}
export async function mobileFetchFieldQueue() {
  return hrGet("/api/hr/field-activity?pendingForApprover=1");
}
export async function mobileFetchRecruitmentQueue() {
  return hrGet("/api/hr/recruitment-requests?pendingForApprover=1");
}
export async function mobileApproveRecruitment(id: string) {
  return hrPost(`/api/hr/recruitment-requests/${encodeURIComponent(id)}/approve`, {});
}
export async function mobileRejectRecruitment(id: string, reason: string) {
  return hrPost(`/api/hr/recruitment-requests/${encodeURIComponent(id)}/reject`, { reason });
}

export async function mobileSubmitAbsence(input: {
  type: string;
  start_date: string;
  end_date: string;
  reason: string;
}) {
  return hrPost("/api/hr/absence-requests", input);
}
export async function mobileListOwnAbsence() {
  return hrGet("/api/hr/absence-requests?mine=1");
}
export async function mobileCancelAbsence(id: string) {
  return hrPost(`/api/hr/absence-requests/${encodeURIComponent(id)}/cancel`, {});
}
export async function mobileFetchMySubmissions() {
  return hrGet("/api/hr/my-submissions");
}
