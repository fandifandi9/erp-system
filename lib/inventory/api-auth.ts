import { cookies } from "next/headers";
import PocketBase from "pocketbase";
import {
  canAccessInventory,
  canCreateInventoryDraft,
  canPostInventoryMovement,
} from "@/lib/inventory/access";
import { parsePbAuthCookieValue } from "@/lib/pb-auth-cookie";
import { getPocketBaseUrl } from "@/lib/inventory/pb-server";

export type ApiAuthContext = {
  userId: string;
  user: Record<string, unknown>;
};

async function resolveUserFromToken(token: string): Promise<ApiAuthContext | null> {
  const url = getPocketBaseUrl();
  if (!url || !token.trim()) return null;

  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  pb.authStore.save(token, null as never);

  try {
    const auth = await pb.collection("users").authRefresh();
    const record = auth.record as Record<string, unknown>;
    if (!record?.id) return null;
    return { userId: String(record.id), user: record };
  } catch {
    return null;
  }
}

export async function getApiAuthUser(req?: Request): Promise<ApiAuthContext | null> {
  const bearer = req?.headers.get("authorization")?.trim();
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7).trim();
    const fromToken = await resolveUserFromToken(token);
    if (fromToken) return fromToken;
  }

  const jar = await cookies();
  const raw = jar.get("pb_auth")?.value;
  if (!raw) return null;

  const parsed = parsePbAuthCookieValue(raw);
  if (!parsed?.model?.id) return null;

  if (parsed.token) {
    const fromToken = await resolveUserFromToken(parsed.token);
    if (fromToken) return fromToken;
  }

  return { userId: String(parsed.model.id), user: parsed.model };
}

export async function requireInventoryAccess(req?: Request): Promise<ApiAuthContext> {
  const ctx = await getApiAuthUser(req);
  if (!ctx || !canAccessInventory(ctx.user)) {
    throw new InventoryApiError("Akses inventory ditolak.", 403);
  }
  return ctx;
}

export async function requireInventoryDraftAccess(req?: Request): Promise<ApiAuthContext> {
  const ctx = await requireInventoryAccess(req);
  if (!canCreateInventoryDraft(ctx.user)) {
    throw new InventoryApiError("Tidak boleh membuat movement draft.", 403);
  }
  return ctx;
}

export async function requireInventoryPostAccess(req?: Request): Promise<ApiAuthContext> {
  const ctx = await requireInventoryAccess(req);
  if (!canPostInventoryMovement(ctx.user)) {
    throw new InventoryApiError("Hanya supervisor/admin yang boleh posting stok.", 403);
  }
  return ctx;
}

export class InventoryApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function jsonError(err: unknown, fallback = "Terjadi kesalahan.") {
  if (err instanceof InventoryApiError) {
    return Response.json({ ok: false, error: err.message }, { status: err.status });
  }
  let msg = err instanceof Error ? err.message : fallback;
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { message?: string } }).response;
    if (data?.message) msg = data.message;
  }
  const status =
    err && typeof err === "object" && "status" in err && typeof (err as { status: number }).status === "number"
      ? (err as { status: number }).status
      : 500;
  return Response.json({ ok: false, error: msg }, { status: status >= 400 ? status : 500 });
}
