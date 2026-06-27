import { NextResponse } from "next/server";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { postAutoStockMovementServer } from "@/lib/inventory/auto-stock-server";

type LineInput = { product: string; qty: number };

type RequestBody = {
  type: "SALE" | "PURCHASE";
  warehouse: string;
  reference_type: string;
  reference_id: string;
  reference_no: string;
  lines: LineInput[];
  user_id: string;
};

export async function POST(req: Request) {
  try {
    const auth = await getApiAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as RequestBody;

    if (!body.warehouse || !body.lines?.length) {
      return NextResponse.json(
        { ok: false, error: "warehouse dan lines wajib diisi." },
        { status: 400 },
      );
    }

    const userId = body.user_id?.trim() || auth.userId;
    const result = await postAutoStockMovementServer({
      type: body.type,
      warehouse: body.warehouse,
      reference_type: body.reference_type,
      reference_id: body.reference_id,
      reference_no: body.reference_no,
      lines: body.lines,
      userId,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal membuat pergerakan stok otomatis.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
