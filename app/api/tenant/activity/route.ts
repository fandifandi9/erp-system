import { NextResponse } from "next/server";
import { cachedFetch } from "@/lib/catalog/stock-cache";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import { TENANT_COLLECTIONS } from "@/lib/tenant/collections";
import { activityEventForUser } from "@/lib/tenant/notify-user";
import type { EmitActivityInput } from "@/lib/tenant/types";

export async function GET(req: Request) {
  try {
    const ctx = await getApiAuthUser(req);
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
    const url = new URL(req.url);
    const storeId = url.searchParams.get("storeId") || undefined;
    const module = url.searchParams.get("module") || undefined;
    const perPage = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const since = url.searchParams.get("since") || undefined;
    const forMe = url.searchParams.get("forMe") === "1";

    const parts: string[] = [];
    if (storeId) parts.push(`store = "${storeId}"`);
    if (module) parts.push(`module = "${module}"`);
    if (since) parts.push(`occurred_at >= "${since}"`);

    const adminPb = await getInventoryAdminPb();
    const cacheKey = `tenant:activity:${ctx.userId}:${storeId ?? ""}:${module ?? ""}:${since ?? ""}:${forMe ? "me" : "all"}:${perPage}`;
    const payload = await cachedFetch(
      cacheKey,
      async () => {
        const fetchLimit = forMe ? Math.min(perPage * 4, 100) : perPage;
        const res = await adminPb.collection(TENANT_COLLECTIONS.activityEvents).getList(1, fetchLimit, {
          sort: "-occurred_at",
          filter: parts.length ? parts.join(" && ") : undefined,
          expand: "actor,store,warehouse",
          requestKey: null,
        });
        let items = res.items;
        if (forMe) {
          items = items.filter((ev) =>
            activityEventForUser(
              (ev as { payload_json?: string }).payload_json,
              ctx.userId,
            ),
          );
          items = items.slice(0, perPage);
        }
        return { items, total: forMe ? items.length : res.totalItems };
      },
      20_000,
    );
    return NextResponse.json(payload);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal memuat aktivitas" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getApiAuthUser(req);
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
    const body = (await req.json()) as EmitActivityInput;
    if (!body.event_code || !body.module) {
      return NextResponse.json({ error: "event_code dan module wajib" }, { status: 400 });
    }
    const adminPb = await getInventoryAdminPb();
    await emitBusinessEventServer(adminPb, { ...body, actor_id: ctx.userId });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mencatat aktivitas" },
      { status: 500 },
    );
  }
}
