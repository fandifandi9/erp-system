import { NextResponse } from "next/server";
import { canAccess } from "@/lib/rbac";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { TENANT_COLLECTIONS } from "@/lib/tenant/collections";

export async function GET(req: Request) {
  try {
    const ctx = await getApiAuthUser(req);
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
    if (!canAccess(ctx.user, "/pengaturan/audit-log")) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }
    const url = new URL(req.url);
    const module = url.searchParams.get("module") || undefined;
    const perPage = Math.min(Number(url.searchParams.get("limit") || 40), 100);
    const adminPb = await getInventoryAdminPb();
    const res = await adminPb.collection(TENANT_COLLECTIONS.auditLog).getList(1, perPage, {
      sort: "-occurred_at",
      filter: module ? `module = "${module}"` : undefined,
      expand: "actor,store,warehouse",
    });
    return NextResponse.json({ items: res.items, total: res.totalItems });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal memuat audit log" },
      { status: 500 },
    );
  }
}
