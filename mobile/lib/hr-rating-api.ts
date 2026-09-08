import { pb } from "@/lib/pocketbase";
import { getErpWebUrl, isLoopbackUrl, requireErpWebUrl } from "@/lib/env";
import { apiErrorFromJson, MOBILE_OFFLINE } from "@/lib/mobile-api-error";

function requireErpUrl(): string {
  return requireErpWebUrl();
}

function authHeaders(json = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  return headers;
}

async function parse(res: Response): Promise<any> {
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.ok === false) {
    throw new Error(apiErrorFromJson(json));
  }
  return json;
}

async function safeFetch(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(MOBILE_OFFLINE);
  }
}

export function isRatingApiConfigured() {
  const u = getErpWebUrl();
  if (!u) return false;
  if (isLoopbackUrl(u) && typeof __DEV__ !== "undefined" && !__DEV__) return false;
  return true;
}

export async function mobileListMyRatingTasks() {
  const base = requireErpUrl();
  return parse(await safeFetch(`${base}/api/hr/rating/my-tasks`, { headers: authHeaders(false) }));
}

export async function mobileGetMyRatingResult() {
  const base = requireErpUrl();
  return parse(await safeFetch(`${base}/api/hr/rating/my-result`, { headers: authHeaders(false) }));
}

export async function mobileGetRatingTask(id: string) {
  const base = requireErpUrl();
  return parse(await safeFetch(`${base}/api/hr/rating/tasks/${id}`, { headers: authHeaders(false) }));
}

export async function mobileSaveRatingDraft(
  id: string,
  scores: { aspect_id: string; score: number; comment?: string }[],
) {
  const base = requireErpUrl();
  return parse(
    await safeFetch(`${base}/api/hr/rating/tasks/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ scores }),
    }),
  );
}

export async function mobileSubmitRating(id: string) {
  const base = requireErpUrl();
  return parse(
    await safeFetch(`${base}/api/hr/rating/tasks/${id}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ action: "submit" }),
    }),
  );
}
