/**
 * mobile/lib/hr-attendance-api.ts — ERP attendance API client (authenticated user → server).
 */

import { pb } from "@/lib/pocketbase";
import { getErpWebUrl, isLoopbackUrl, requireErpWebUrl } from "@/lib/env";
import { MOBILE_OFFLINE } from "@/lib/mobile-api-error";

export type AttendanceApiResult = {
  success: boolean;
  message: string;
  data?: unknown;
  id?: string;
  queued?: boolean;
  httpStatus?: number;
};

function requireErpUrl(): string {
  return requireErpWebUrl();
}

function authHeaders(json = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (pb.authStore.token) {
    headers.Authorization = `Bearer ${pb.authStore.token}`;
  }
  return headers;
}

async function parseApiResponse(res: Response): Promise<AttendanceApiResult> {
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
    return { success: false, message, httpStatus: res.status };
  }
  return { success: true, message, data: json.data, id: json.id, httpStatus: res.status };
}

async function attendanceFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(MOBILE_OFFLINE);
  }
}

export async function mobileCheckIn(input: {
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  device_id?: string | null;
  selfie?: { uri: string; name: string; type: string } | null;
}): Promise<AttendanceApiResult> {
  const base = requireErpUrl();
  const headers = authHeaders(!input.selfie?.uri);

  if (input.selfie?.uri) {
    const form = new FormData();
    if (input.lat != null) form.append("lat", String(input.lat));
    if (input.lng != null) form.append("lng", String(input.lng));
    if (input.accuracy != null) form.append("accuracy", String(input.accuracy));
    if (input.device_id) form.append("device_id", input.device_id);
    form.append("selfie", {
      uri: input.selfie.uri,
      name: input.selfie.name || "checkin_selfie.jpg",
      type: input.selfie.type || "image/jpeg",
    } as unknown as Blob);

    const res = await attendanceFetch(`${base}/api/hr/attendance/check-in`, {
      method: "POST",
      headers,
      body: form,
    });
    return parseApiResponse(res);
  }

  const res = await attendanceFetch(`${base}/api/hr/attendance/check-in`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy,
      device_id: input.device_id,
    }),
  });
  return parseApiResponse(res);
}

export async function mobileCheckOut(): Promise<AttendanceApiResult> {
  const base = requireErpUrl();
  const res = await attendanceFetch(`${base}/api/hr/attendance/check-out`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  return parseApiResponse(res);
}

export type TodayAttendancePayload = {
  attendance: unknown;
  schedule?: {
    source?: string;
    startTime?: string | null;
    endTime?: string | null;
    isWorkingDay?: boolean;
    scheduleName?: string;
    timezone?: string;
  };
  metrics?: {
    status?: string;
    lateMinutes?: number;
    overtimeMinutes?: number;
    earlyLeaveMinutes?: number;
  };
};

export async function mobileGetTodayAttendance(): Promise<
  AttendanceApiResult & { schedule?: TodayAttendancePayload["schedule"]; metrics?: TodayAttendancePayload["metrics"] }
> {
  const base = requireErpUrl();
  const res = await attendanceFetch(`${base}/api/hr/attendance/today`, {
    method: "GET",
    headers: authHeaders(false),
  });
  let json: {
    ok?: boolean;
    error?: string;
    message?: string;
    data?: unknown;
    schedule?: TodayAttendancePayload["schedule"];
    metrics?: TodayAttendancePayload["metrics"];
  } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    /* ignore */
  }
  const message = json.message || json.error || (res.ok ? "OK" : "Gagal memuat absensi hari ini.");
  if (!res.ok || json.ok === false) {
    return { success: false, message, httpStatus: res.status };
  }
  return {
    success: true,
    message,
    data: json.data,
    schedule: json.schedule,
    metrics: json.metrics,
    httpStatus: res.status,
  };
}

export async function mobileListMyAttendance(page = 1, perPage = 30): Promise<{
  success: boolean;
  message: string;
  items?: unknown[];
  totalItems?: number;
  httpStatus?: number;
}> {
  const base = requireErpUrl();
  const res = await attendanceFetch(
    `${base}/api/hr/attendance/history?page=${page}&perPage=${perPage}`,
    { method: "GET", headers: authHeaders(false) },
  );
  let json: {
    ok?: boolean;
    error?: string;
    message?: string;
    items?: unknown[];
    totalItems?: number;
  } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    /* ignore */
  }
  if (!res.ok || json.ok === false) {
    return {
      success: false,
      message: json.message || json.error || `HTTP ${res.status}`,
      items: [],
      httpStatus: res.status,
    };
  }
  return {
    success: true,
    message: json.message || "OK",
    items: json.items || [],
    totalItems: json.totalItems,
    httpStatus: res.status,
  };
}

export function isAttendanceApiConfigured(): boolean {
  const u = getErpWebUrl();
  if (!u) return false;
  if (isLoopbackUrl(u) && typeof __DEV__ !== "undefined" && !__DEV__) return false;
  return true;
}
