import { NextResponse } from "next/server";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import { TENANT_COLLECTIONS } from "@/lib/tenant/collections";
import {
  assertUserCompanyAccess,
  listAccessibleCompanyIds,
} from "@/lib/tenant/company-access";

async function writeContextAudit(
  adminPb: Awaited<ReturnType<typeof getInventoryAdminPb>>,
  userId: string,
  summary: string,
  changes: { field: string; before: unknown; after: unknown }[],
  companyId?: string,
  storeId?: string,
  warehouseId?: string,
) {
  try {
    await adminPb.collection(TENANT_COLLECTIONS.auditLog).create({
      occurred_at: new Date().toISOString(),
      actor: userId,
      actor_device: "web",
      module: "settings",
      action: "switch_context",
      summary,
      changes_json: JSON.stringify(changes),
      company: companyId,
      store: storeId,
      warehouse: warehouseId,
    });
  } catch {
    /* optional */
  }
}

export async function GET() {
  try {
    const ctx = await getApiAuthUser();
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
    const adminPb = await getInventoryAdminPb();
    const user = await adminPb.collection("users").getOne(ctx.userId);
    const u = user as Record<string, unknown>;
    const allowedIds = await listAccessibleCompanyIds(adminPb, ctx.userId, u);
    let companyId = (u.active_company as string) || (u.default_company as string) || null;
    if (companyId && !allowedIds.includes(companyId)) {
      companyId = allowedIds[0] ?? null;
    }
    if (!companyId) companyId = allowedIds[0] ?? null;
    const storeId = (u.active_store as string) || (u.default_store as string) || null;
    const warehouseId = (u.active_warehouse as string) || (u.default_warehouse as string) || null;
    let companyName: string | null = null;
    let storeName: string | null = null;
    let warehouseName: string | null = null;
    if (companyId) {
      try {
        const cp = await adminPb.collection("biz_company_profile").getOne(companyId);
        companyName = String((cp as { company_name?: string }).company_name ?? "");
      } catch {
        /* optional */
      }
    }
    if (storeId) {
      try {
        const st = await adminPb.collection("biz_stores").getOne(storeId);
        storeName = String((st as { name?: string }).name ?? "");
      } catch {
        /* optional */
      }
    }
    if (warehouseId) {
      try {
        const wh = await adminPb.collection("inv_warehouses").getOne(warehouseId);
        warehouseName = String((wh as { name?: string }).name ?? "");
      } catch {
        /* optional */
      }
    }
    return NextResponse.json({ companyId, companyName, storeId, storeName, warehouseId, warehouseName });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal memuat konteks" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getApiAuthUser(req);
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
    const body = (await req.json()) as {
      companyId?: string;
      companyName?: string;
      storeId?: string;
      storeName?: string;
      warehouseId?: string;
      warehouseName?: string;
      prevCompanyId?: string;
      prevStoreId?: string;
      prevWarehouseId?: string;
    };
    if (!body.storeId || !body.warehouseId) {
      return NextResponse.json({ error: "storeId dan warehouseId wajib" }, { status: 400 });
    }
    const adminPb = await getInventoryAdminPb();
    if (body.companyId) {
      await assertUserCompanyAccess(adminPb, ctx.userId, body.companyId, ctx.user);
    }
    const patch: Record<string, string> = {
      active_store: body.storeId,
      active_warehouse: body.warehouseId,
      default_store: body.storeId,
      default_warehouse: body.warehouseId,
    };
    if (body.companyId) {
      patch.active_company = body.companyId;
      patch.default_company = body.companyId;
    }
    await adminPb.collection("users").update(ctx.userId, patch);

    const companyChanged = body.prevCompanyId && body.prevCompanyId !== body.companyId;
    const storeChanged = body.prevStoreId && body.prevStoreId !== body.storeId;
    const whChanged = body.prevWarehouseId && body.prevWarehouseId !== body.warehouseId;
    if (companyChanged || storeChanged || whChanged) {
      const parts: string[] = [];
      if (companyChanged) parts.push(`entitas → ${body.companyName || body.companyId}`);
      if (storeChanged) parts.push(`toko → ${body.storeName || body.storeId}`);
      if (whChanged) parts.push(`gudang → ${body.warehouseName || body.warehouseId}`);
      await writeContextAudit(
        adminPb,
        ctx.userId,
        `Switch konteks: ${parts.join(", ")}`,
        [
          ...(companyChanged
            ? [{ field: "active_company", before: body.prevCompanyId, after: body.companyId }]
            : []),
          ...(storeChanged
            ? [{ field: "active_store", before: body.prevStoreId, after: body.storeId }]
            : []),
          ...(whChanged
            ? [{ field: "active_warehouse", before: body.prevWarehouseId, after: body.warehouseId }]
            : []),
        ],
        body.companyId,
        body.storeId,
        body.warehouseId,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal menyimpan konteks" },
      { status: 500 },
    );
  }
}
