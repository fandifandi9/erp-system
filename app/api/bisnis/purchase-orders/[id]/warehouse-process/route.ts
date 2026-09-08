import { NextResponse } from "next/server";
import { requirePembelianOrWmsApiUser, bisnisApiError } from "@/lib/bisnis/api-auth";
import {
  updateWarehouseProcess,
  type WarehouseProcessAction,
} from "@/lib/bisnis/purchase-warehouse";
import type { WarehouseProcessMode } from "@/lib/bisnis/types";

type Body = {
  action?: WarehouseProcessAction;
  note?: string;
  receiving_warehouse?: string;
  surat_jalan_no?: string;
  surat_jalan_verified?: boolean;
  process_mode?: WarehouseProcessMode;
  receiving_workflow_json?: string;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePembelianOrWmsApiUser(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as Body;
    const action = body.action;
    if (action !== "start_check" && action !== "hold" && action !== "complete") {
      throw bisnisApiError("Aksi gudang tidak valid.", 400);
    }

    const updated = await updateWarehouseProcess(id, auth.userId, action, {
      note: body.note,
      receiving_warehouse: body.receiving_warehouse,
      surat_jalan_no: body.surat_jalan_no,
      surat_jalan_verified: body.surat_jalan_verified,
      process_mode: body.process_mode,
      receiving_workflow_json: body.receiving_workflow_json,
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    const message = e instanceof Error ? e.message : "Gagal menyimpan proses gudang.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
