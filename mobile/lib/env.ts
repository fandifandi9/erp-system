/** PocketBase base URL. Diisi lewat `.env` / EAS `EXPO_PUBLIC_POCKETBASE_URL`. */

function stripSlash(u: string): string {
  return u.trim().replace(/\/$/, "");
}

export function isLoopbackUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/.test(url);
  }
}

export const ERP_URL_NOT_CONFIGURED = "Server belum dikonfigurasi.";

export function getPocketBaseUrl(): string {
  return stripSlash(process.env.EXPO_PUBLIC_POCKETBASE_URL ?? "");
}

export function getErpWebUrl(): string {
  return stripSlash(process.env.EXPO_PUBLIC_ERP_WEB_URL ?? "");
}

/** Dev-only host labels for login diagnostics (no secrets). */
export function getMobileEnvHostDiagnostics(): {
  pocketBaseHost: string;
  erpWebHost: string;
  configured: boolean;
} {
  let pocketBaseHost = "";
  let erpWebHost = "";
  try {
    pocketBaseHost = new URL(getPocketBaseUrl() || "http://invalid").host;
  } catch {
    pocketBaseHost = "(invalid)";
  }
  try {
    erpWebHost = new URL(getErpWebUrl() || "http://invalid").host;
  } catch {
    erpWebHost = "(invalid)";
  }
  return {
    pocketBaseHost,
    erpWebHost,
    configured: isMobileServerConfigured(),
  };
}

export function isStagingOrProductionMobileUrl(): boolean {
  const hosts = `${getPocketBaseUrl()} ${getErpWebUrl()}`.toLowerCase();
  return (
    hosts.includes("serba.space") ||
    hosts.includes("pb-staging") ||
    hosts.includes("staging.serba")
  );
}

function rejectLoopbackInRelease(url: string): string {
  if (url && isLoopbackUrl(url) && typeof __DEV__ !== "undefined" && !__DEV__) {
    return "";
  }
  return url;
}

/** Fail-fast: no localhost fallback in release builds. */
export function requirePocketBaseUrl(): string {
  const u = rejectLoopbackInRelease(getPocketBaseUrl());
  if (!u) {
    throw new Error(ERP_URL_NOT_CONFIGURED);
  }
  return u;
}

export function requireErpWebUrl(): string {
  const u = rejectLoopbackInRelease(getErpWebUrl());
  if (!u) {
    throw new Error(ERP_URL_NOT_CONFIGURED);
  }
  return u;
}

export function isMobileServerConfigured(): boolean {
  try {
    return Boolean(rejectLoopbackInRelease(getPocketBaseUrl()) && rejectLoopbackInRelease(getErpWebUrl()));
  } catch {
    return false;
  }
}
