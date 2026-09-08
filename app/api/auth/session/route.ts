import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import PocketBase from "pocketbase";
import { applyPbAuthCookie, clearPbAuthCookie } from "@/lib/pb-auth-cookie-server";
import { clearAccountVerificationCookie } from "@/lib/hr/account-verification-cookie-server";
import { parsePbAuthCookieValue } from "@/lib/pb-auth-cookie";
import { getPocketBaseUrl, getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { enrichUserWithAccessContext } from "@/lib/access/module-assignments-server";

type SessionBody = {
  token?: string;
  model?: Record<string, unknown>;
};

const RBAC_FIELDS = [
  "id",
  "email",
  "name",
  "status",
  "account_type",
  "role",
  "role_code",
  "dashboard_access",
  "inventory_role",
  "web_access",
  "session_nonce",
] as const;

/** Model cookie hanya dari record PB (hasil authRefresh) — bukan dari client. */
function rbacModelFromRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of RBAC_FIELDS) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  if (!out.id && record.id) out.id = record.id;
  return out;
}

/**
 * Validasi token ke PocketBase via authRefresh.
 * Identity selalu dari record PB, bukan userId/model yang dikirim client.
 */
async function validateTokenWithPocketBase(
  token: string,
): Promise<{ token: string; model: Record<string, unknown> } | null> {
  const url = getPocketBaseUrl();
  if (!url) return null;

  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  // Model placeholder minimal; identity diganti penuh dari authRefresh.
  pb.authStore.save(token, { id: "pending" } as never);

  try {
    const auth = await pb.collection("users").authRefresh({ requestKey: null });
    const record = auth.record as Record<string, unknown>;
    if (!record?.id) return null;
    const nextToken = (auth.token || token).trim();
    if (!nextToken) return null;

    let model = rbacModelFromRecord(record);
    try {
      const adminPb = await getInventoryAdminPb();
      model = await enrichUserWithAccessContext(adminPb, model);
    } catch {
      /* Phase 35I — fail open to legacy RBAC if assignment load fails */
    }

    return { token: nextToken, model };
  } catch {
    return null;
  }
}

/**
 * Validasi cookie HttpOnly + kembalikan token/model untuk restore `pb.authStore` di client.
 * Jika token invalid: hapus cookie dan 401.
 */
export async function GET() {
  const jar = await cookies();
  const raw = jar.get("pb_auth")?.value;
  if (!raw) {
    return NextResponse.json({ error: "Tidak ada sesi" }, { status: 401 });
  }

  const parsed = parsePbAuthCookieValue(raw);
  const token = parsed?.token?.trim();
  if (!token) {
    const res = NextResponse.json({ error: "Sesi tidak valid" }, { status: 401 });
    clearPbAuthCookie(res);
    clearAccountVerificationCookie(res);
    return res;
  }

  if (!getPocketBaseUrl()) {
    return NextResponse.json({ error: "PocketBase URL belum dikonfigurasi" }, { status: 500 });
  }

  const validated = await validateTokenWithPocketBase(token);
  if (!validated) {
    const res = NextResponse.json({ error: "Sesi kedaluwarsa" }, { status: 401 });
    clearPbAuthCookie(res);
    clearAccountVerificationCookie(res);
    return res;
  }

  const res = NextResponse.json({
    token: validated.token,
    model: validated.model,
  });
  applyPbAuthCookie(res, validated.token, validated.model);
  return res;
}

/**
 * Set HttpOnly auth cookie setelah login client.
 * Token wajib lolos authRefresh di server; token palsu/expired tidak disimpan.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SessionBody;
    const token = body.token?.trim();
    if (!token) {
      return NextResponse.json({ error: "Token wajib" }, { status: 400 });
    }

    if (!getPocketBaseUrl()) {
      return NextResponse.json({ error: "PocketBase URL belum dikonfigurasi" }, { status: 500 });
    }

    const validated = await validateTokenWithPocketBase(token);
    if (!validated) {
      const res = NextResponse.json({ error: "Token tidak valid atau kedaluwarsa" }, { status: 401 });
      clearPbAuthCookie(res);
      return res;
    }

    const res = NextResponse.json({ ok: true });
    applyPbAuthCookie(res, validated.token, validated.model);
    return res;
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal menyimpan sesi" },
      { status: 500 },
    );
  }
}

/** Clear HttpOnly auth cookie (logout) + revoke account verification. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearPbAuthCookie(res);
  clearAccountVerificationCookie(res);
  return res;
}
