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

export function isReportingApiConfigured() {
  const u = getErpWebUrl();
  if (!u) return false;
  if (isLoopbackUrl(u) && typeof __DEV__ !== "undefined" && !__DEV__) return false;
  return true;
}

export function reportingFileSource(path: string) {
  return {
    uri: `${requireErpUrl()}${path}`,
    headers: pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : undefined,
  };
}

export async function mobileListCases(kind: "report" | "finding") {
  const base = requireErpUrl();
  const path = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  return parse(await safeFetch(`${base}${path}`, { headers: authHeaders(false) }));
}

export async function mobileGetCase(kind: "report" | "finding", id: string) {
  const base = requireErpUrl();
  const path = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  return parse(await safeFetch(`${base}${path}/${id}`, { headers: authHeaders(false) }));
}

export async function mobileCreateCase(
  kind: "report" | "finding",
  body: Record<string, unknown>,
) {
  const base = requireErpUrl();
  const path = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  return parse(
    await safeFetch(`${base}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function mobilePatchCase(
  kind: "report" | "finding",
  id: string,
  body: Record<string, unknown>,
) {
  const base = requireErpUrl();
  const path = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  return parse(
    await safeFetch(`${base}${path}/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function mobileSubmitCase(kind: "report" | "finding", id: string) {
  const base = requireErpUrl();
  const path = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  return parse(
    await safeFetch(`${base}${path}/${id}/submit`, {
      method: "POST",
      headers: authHeaders(),
      body: "{}",
    }),
  );
}

export async function mobileUploadEvidence(
  kind: "report" | "finding",
  id: string,
  file: { uri: string; name: string; type: string },
) {
  const base = requireErpUrl();
  const path = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  const fd = new FormData();
  fd.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  return parse(
    await safeFetch(`${base}${path}/${id}/attachments`, {
      method: "POST",
      headers: authHeaders(false),
      body: fd,
    }),
  );
}

export async function mobileDeleteEvidence(kind: "report" | "finding", id: string, attId: string) {
  const base = requireErpUrl();
  const path = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  return parse(
    await safeFetch(`${base}${path}/${id}/attachments/${attId}`, {
      method: "DELETE",
      headers: authHeaders(false),
    }),
  );
}
