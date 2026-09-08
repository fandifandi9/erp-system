import type { NextResponse } from "next/server";

export const PB_AUTH_COOKIE = "pb_auth";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function buildPbAuthCookieHeader(token: string, model: Record<string, unknown>): string {
  const payload = JSON.stringify({ token, model });
  const encoded = encodeURIComponent(payload);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${PB_AUTH_COOKIE}=${encoded}; Path=/; Max-Age=${MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearPbAuthCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${PB_AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export function applyPbAuthCookie(res: NextResponse, token: string, model: Record<string, unknown>) {
  res.headers.append("Set-Cookie", buildPbAuthCookieHeader(token, model));
}

export function clearPbAuthCookie(res: NextResponse) {
  res.headers.append("Set-Cookie", clearPbAuthCookieHeader());
}
