import { canAccess } from "@/lib/rbac";
import { getApiAuthUser } from "@/lib/inventory/api-auth";

export type BisnisApiError = Error & { status?: number };

export function bisnisApiError(message: string, status = 400): BisnisApiError {
  const e = new Error(message) as BisnisApiError;
  e.status = status;
  return e;
}

/** User login + akses modul penjualan. */
export async function requirePenjualanApiUser(req?: Request) {
  const ctx = await getApiAuthUser(req);
  if (!ctx) throw bisnisApiError("Login diperlukan.", 401);
  if (!canAccess(ctx.user, "/bisnis/penjualan")) {
    throw bisnisApiError("Akses penjualan ditolak.", 403);
  }
  return ctx;
}

/** User login + akses penjualan atau WMS/gudang (upload AWB di gudang). */
export async function requirePenjualanOrWmsApiUser(req?: Request) {
  const ctx = await getApiAuthUser(req);
  if (!ctx) throw bisnisApiError("Login diperlukan.", 401);
  const ok =
    canAccess(ctx.user, "/bisnis/penjualan") ||
    canAccess(ctx.user, "/wms") ||
    canAccess(ctx.user, "/gudang");
  if (!ok) throw bisnisApiError("Akses ditolak.", 403);
  return ctx;
}

/** User login + akses modul pembelian. */
export async function requirePembelianApiUser(req?: Request) {
  const ctx = await getApiAuthUser(req);
  if (!ctx) throw bisnisApiError("Login diperlukan.", 401);
  if (!canAccess(ctx.user, "/bisnis/pembelian")) {
    throw bisnisApiError("Akses pembelian ditolak.", 403);
  }
  return ctx;
}
