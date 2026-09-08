import { NextResponse } from "next/server";
import { requireReturApiUser } from "@/lib/bisnis/api-auth";
import { createSalesReturFromOrder } from "@/lib/bisnis/sales-retur-create";
import { createPurchaseReturFromOrder } from "@/lib/bisnis/purchase-retur-create";
import {
  createStandaloneRetur,
  type CreateStandaloneReturInput,
} from "@/lib/bisnis/standalone-retur-create";
import type { CreateSalesReturInput } from "@/lib/bisnis/sales-retur-expected";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { canAccess } from "@/lib/rbac";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string };
  const raw = e instanceof Error ? e.message : err.message ?? fallback;
  if (/wasn't found|404|collection/i.test(raw)) {
    return "Field retur belum ada di PocketBase. Jalankan: npm run pb:retur-schema";
  }
  return raw;
}

type Body =
  | {
      mode: "from_so";
      sales_order_id: string;
      input?: CreateSalesReturInput;
    }
  | {
      mode: "from_po";
      purchase_order_id: string;
      reason?: string;
    }
  | ({
      mode: "standalone";
    } & CreateStandaloneReturInput);

export async function POST(req: Request) {
  try {
    const auth = await requireReturApiUser(req);
    const body = (await req.json()) as Body;
    const adminPb = await getInventoryAdminPb();

    if (body.mode === "from_so") {
      if (!canAccess(auth.user, "/bisnis/penjualan") && !canAccess(auth.user, "/bisnis/retur")) {
        return NextResponse.json({ ok: false, error: "Akses penjualan ditolak." }, { status: 403 });
      }
      if (!body.sales_order_id?.trim()) {
        return NextResponse.json({ ok: false, error: "sales_order_id wajib." }, { status: 400 });
      }
      const result = await createSalesReturFromOrder(
        adminPb,
        body.sales_order_id,
        auth.userId,
        body.input,
      );
      return NextResponse.json({ ok: true, data: result });
    }

    if (body.mode === "from_po") {
      if (!canAccess(auth.user, "/bisnis/pembelian") && !canAccess(auth.user, "/bisnis/retur")) {
        return NextResponse.json({ ok: false, error: "Akses pembelian ditolak." }, { status: 403 });
      }
      if (!body.purchase_order_id?.trim()) {
        return NextResponse.json({ ok: false, error: "purchase_order_id wajib." }, { status: 400 });
      }
      const result = await createPurchaseReturFromOrder(
        adminPb,
        body.purchase_order_id,
        auth.userId,
        { reason: body.reason },
      );
      return NextResponse.json({ ok: true, data: result });
    }

    if (body.mode === "standalone") {
      const { mode: _m, ...rest } = body;
      const result = await createStandaloneRetur(adminPb, auth.userId, rest);
      return NextResponse.json({ ok: true, data: result });
    }

    return NextResponse.json({ ok: false, error: "mode tidak valid." }, { status: 400 });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { ok: false, error: pbErrorMessage(e, "Gagal membuat retur") },
      { status },
    );
  }
}
