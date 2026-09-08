/**
 * Client adapter for leave mutations → Next.js HR API (Wave 2).
 * Web: cookie credentials. Mobile: pass Authorization Bearer via fetchLeaveApi options.
 */

export type LeaveApiResult = {
  success: boolean;
  message: string;
  data?: unknown;
  id?: string;
};

export type LeaveApiFetchOptions = {
  /** Absolute API origin for mobile (EXPO_PUBLIC_ERP_WEB_URL). Web: omit → same origin. */
  baseUrl?: string;
  /** Bearer token (mobile). Web relies on HttpOnly cookie + credentials:include. */
  bearerToken?: string | null;
};

async function leaveApiPost(
  path: string,
  body?: Record<string, unknown>,
  opts?: LeaveApiFetchOptions,
): Promise<LeaveApiResult> {
  const base = (opts?.baseUrl ?? "").replace(/\/$/, "");
  const url = `${base}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.bearerToken) {
    headers.Authorization = `Bearer ${opts.bearerToken}`;
  }

  const res = await fetch(url, {
    method: "POST",
    credentials: opts?.bearerToken ? "omit" : "include",
    headers,
    body: body ? JSON.stringify(body) : JSON.stringify({}),
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
  return {
    success: true,
    message,
    data: json.data,
    id: json.id,
  };
}

export async function apiSubmitLeave(
  input: { start_date: string; end_date: string; reason?: string },
  opts?: LeaveApiFetchOptions,
): Promise<LeaveApiResult> {
  return leaveApiPost(
    "/api/hr/leave",
    {
      start_date: input.start_date,
      end_date: input.end_date,
      ...(input.reason != null ? { reason: input.reason } : {}),
    },
    opts,
  );
}

export async function apiApproveLeave(
  requestId: string,
  opts?: LeaveApiFetchOptions,
): Promise<LeaveApiResult> {
  return leaveApiPost(`/api/hr/leave/${encodeURIComponent(requestId)}/approve`, {}, opts);
}

export async function apiRejectLeave(
  requestId: string,
  reason: string,
  opts?: LeaveApiFetchOptions,
): Promise<LeaveApiResult> {
  return leaveApiPost(
    `/api/hr/leave/${encodeURIComponent(requestId)}/reject`,
    { reason },
    opts,
  );
}

export async function apiCancelLeave(
  requestId: string,
  opts?: LeaveApiFetchOptions,
): Promise<LeaveApiResult> {
  return leaveApiPost(`/api/hr/leave/${encodeURIComponent(requestId)}/cancel`, {}, opts);
}
