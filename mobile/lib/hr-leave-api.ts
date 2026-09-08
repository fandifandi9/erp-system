import { pb } from "@/lib/pocketbase";
import { getErpWebUrl } from "@/lib/inventory/env";

export type LeaveApiResult = {
  success: boolean;
  message: string;
  data?: unknown;
  id?: string;
};

function requireErpUrl(): string {
  const base = getErpWebUrl();
  if (!base) {
    throw new Error(
      "EXPO_PUBLIC_ERP_WEB_URL belum diset di mobile/.env (URL ERP web untuk API cuti).",
    );
  }
  return base;
}

async function leaveApiPost(
  path: string,
  body?: Record<string, unknown>,
): Promise<LeaveApiResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) {
    headers.Authorization = `Bearer ${pb.authStore.token}`;
  }

  const res = await fetch(`${requireErpUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });

  let json: {
    ok?: boolean;
    error?: string;
    message?: string;
    data?: unknown;
    id?: string;
  } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    /* ignore */
  }

  const message = json.message || json.error || (res.ok ? "OK" : `HTTP ${res.status}`);
  if (!res.ok || json.ok === false) {
    return { success: false, message };
  }
  return { success: true, message, data: json.data, id: json.id };
}

export async function mobileSubmitLeave(input: {
  start_date: string;
  end_date: string;
  reason?: string;
}): Promise<LeaveApiResult> {
  return leaveApiPost("/api/hr/leave", {
    start_date: input.start_date,
    end_date: input.end_date,
    ...(input.reason != null ? { reason: input.reason } : {}),
  });
}

export async function mobileApproveLeave(requestId: string): Promise<LeaveApiResult> {
  return leaveApiPost(`/api/hr/leave/${encodeURIComponent(requestId)}/approve`, {});
}

export async function mobileRejectLeave(
  requestId: string,
  reason: string,
): Promise<LeaveApiResult> {
  return leaveApiPost(`/api/hr/leave/${encodeURIComponent(requestId)}/reject`, { reason });
}

export async function mobileCancelLeave(requestId: string): Promise<LeaveApiResult> {
  return leaveApiPost(`/api/hr/leave/${encodeURIComponent(requestId)}/cancel`, {});
}
