import PocketBase from "pocketbase";
import type { ApiAuthContext } from "@/lib/inventory/api-auth";
import { parsePbAuthCookieValue } from "@/lib/pb-auth-cookie";

let cachedPb: PocketBase | null = null;
let cachedAt = 0;

const AUTH_TTL_MS = 9 * 60 * 1000;

/** Hindari karakter @ $ terpotong di .env tanpa tanda kutip. */
function readEnvSecret(value: string | undefined): string {
  let v = (value ?? "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
}

export function getPocketBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_POCKETBASE_URL ||
    process.env.POCKETBASE_URL ||
    ""
  ).trim();
}

/** PocketBase client dengan token user (create draft / read). */
export function createUserPb(auth: ApiAuthContext, token: string): PocketBase {
  const pb = new PocketBase(getPocketBaseUrl());
  pb.autoCancellation(false);
  pb.authStore.save(token, auth.user as never);
  return pb;
}

export function readBearerToken(req?: Request): string | null {
  const bearer = req?.headers.get("authorization")?.trim();
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim() || null;
  }
  return null;
}

export async function readTokenFromCookie(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const raw = jar.get("pb_auth")?.value;
  if (!raw) return null;
  return parsePbAuthCookieValue(raw)?.token ?? null;
}

export async function getUserPbFromRequest(
  req: Request,
  auth: ApiAuthContext
): Promise<PocketBase> {
  const token = readBearerToken(req) || (await readTokenFromCookie());
  if (!token) {
    throw new Error("Token sesi tidak ditemukan. Login ulang.");
  }
  return createUserPb(auth, token);
}

type LegacyAdminAuthResponse = {
  token?: string;
  admin?: Record<string, unknown>;
};

/**
 * Server pb.serba.space memakai endpoint legacy `/api/admins/auth-with-password` (200).
 * SDK 0.26 `pb.admins.authWithPassword` memanggil `_superusers` → 404 di server ini.
 */
async function authAdminLegacy(
  pb: PocketBase,
  url: string,
  email: string,
  password: string
): Promise<void> {
  const res = await fetch(`${url.replace(/\/$/, "")}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
    signal: AbortSignal.timeout(15_000),
  });

  let data: LegacyAdminAuthResponse & { message?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* ignore */
  }

  if (!res.ok || !data.token) {
    const hint =
      res.status === 400
        ? "Email atau kata sandi admin salah."
        : data.message || `HTTP ${res.status}`;
    throw new Error(`Login admin PocketBase gagal: ${hint}`);
  }

  pb.authStore.save(data.token, (data.admin || {}) as never);
}

/** Admin PB untuk posting stok (update balance). */
export async function getInventoryAdminPb(): Promise<PocketBase> {
  const url = getPocketBaseUrl();
  const email = readEnvSecret(process.env.POCKETBASE_ADMIN_EMAIL);
  const password = readEnvSecret(process.env.POCKETBASE_ADMIN_PASSWORD);

  if (!url) throw new Error("NEXT_PUBLIC_POCKETBASE_URL belum diset.");
  if (!email || !password) {
    throw new Error(
      "POCKETBASE_ADMIN_EMAIL dan POCKETBASE_ADMIN_PASSWORD wajib di .env.local untuk posting stok."
    );
  }

  const now = Date.now();
  if (cachedPb?.authStore.isValid && now - cachedAt < AUTH_TTL_MS) {
    return cachedPb;
  }

  const pb = new PocketBase(url);
  pb.autoCancellation(false);

  try {
    await authAdminLegacy(pb, url, email, password);
  } catch (err) {
    cachedPb = null;
    cachedAt = 0;
    throw err;
  }

  cachedPb = pb;
  cachedAt = now;
  return pb;
}

/** Hilangkan relasi kosong — PB menolak string kosong pada field Relation. */
export function cleanMovementPayload(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const key of [
    "from_warehouse",
    "to_warehouse",
    "from_location",
    "to_location",
    "reference_id",
  ]) {
    if (out[key] === "" || out[key] == null) delete out[key];
  }
  return out;
}
