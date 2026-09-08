import { NextResponse } from "next/server";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  canManageCompanyAccess,
  listAllUsersWithCompanyAccess,
  replaceUserCompanyAccess,
} from "@/lib/tenant/company-access";

/** Daftar semua user + mapping akses entitas (owner / HR). */
export async function GET() {
  try {
    const ctx = await getApiAuthUser();
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
    if (!canManageCompanyAccess(ctx.user)) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    const adminPb = await getInventoryAdminPb();
    const data = await listAllUsersWithCompanyAccess(adminPb);
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal memuat data" },
      { status: 500 },
    );
  }
}

/** Update akses entitas satu user: { userId, companyIds[] }. */
export async function PUT(req: Request) {
  try {
    const ctx = await getApiAuthUser(req);
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
    if (!canManageCompanyAccess(ctx.user)) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    const body = (await req.json()) as { userId?: string; companyIds?: string[] };
    if (!body.userId || !Array.isArray(body.companyIds)) {
      return NextResponse.json({ error: "userId dan companyIds wajib" }, { status: 400 });
    }

    const adminPb = await getInventoryAdminPb();
    await replaceUserCompanyAccess(adminPb, body.userId, body.companyIds);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal menyimpan" },
      { status: 500 },
    );
  }
}
