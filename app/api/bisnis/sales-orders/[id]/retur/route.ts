import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { createSalesReturFromOrder } from "@/lib/bisnis/sales-retur-create";
import type { CreateSalesReturInput } from "@/lib/bisnis/sales-retur-expected";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string };
  const raw = e instanceof Error ? e.message : err.message ?? fallback;
  if (/wasn't found|404|collection/i.test(raw)) {
    return "Field retur belum ada di PocketBase. Jalankan: npm run pb:retur-schema";
  }
  return raw;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePenjualanApiUser(req);
    const { id } = await ctx.params;
    let body: CreateSalesReturInput | undefined;
    try {
      const raw = await req.json();
      if (raw && typeof raw === "object" && Array.isArray((raw as CreateSalesReturInput).lines)) {
        body = raw as CreateSalesReturInput;
      }
    } catch {
      body = undefined;
    }
    const adminPb = await getInventoryAdminPb();
    const result = await createSalesReturFromOrder(adminPb, id, auth.userId, body);
    return NextResponse.json({ ok: true, data: result });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { ok: false, error: pbErrorMessage(e, "Gagal membuat retur") },
      { status },
    );
  }
}
