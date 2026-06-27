import { NextResponse } from "next/server";
import {
  jsonError,
  requireInventoryPostAccess,
  requireInventorySupervisorAccess,
} from "@/lib/inventory/api-auth";
import {
  repairDamagedStock,
  reassignDamagedStock,
  writeOffDamagedStock,
  type DispositionLine,
} from "@/lib/inventory/damaged-disposition";

type Body = {
  action?: "repair" | "write_off" | "reassign";
  damaged_warehouse?: string;
  from_damaged_warehouse?: string;
  to_damaged_warehouse?: string;
  company?: string;
  lines?: DispositionLine[];
  note?: string;
  repair_target?: "entity" | "retail";
  target_warehouse?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const action = body.action;
    const lines = body.lines ?? [];
    const note = body.note;

    if (action === "reassign") {
      const auth = await requireInventorySupervisorAccess(req);
      const fromId = body.from_damaged_warehouse?.trim() ?? body.damaged_warehouse?.trim() ?? "";
      const toId = body.to_damaged_warehouse?.trim() ?? "";
      if (!fromId || !toId) {
        return NextResponse.json(
          { ok: false, error: "from_damaged_warehouse dan to_damaged_warehouse wajib." },
          { status: 400 },
        );
      }
      const result = await reassignDamagedStock({
        fromDamagedWarehouseId: fromId,
        toDamagedWarehouseId: toId,
        lines,
        userId: auth.userId,
        note: note?.trim() ?? "",
      });
      return NextResponse.json({ ok: true, action, data: result });
    }

    const auth = await requireInventoryPostAccess(req);
    const damagedWarehouseId = body.damaged_warehouse?.trim() ?? "";
    const companyId = body.company?.trim() ?? "";

    if (action !== "repair" && action !== "write_off") {
      return NextResponse.json({ ok: false, error: "action tidak valid." }, { status: 400 });
    }
    if (!damagedWarehouseId || !companyId) {
      return NextResponse.json(
        { ok: false, error: "damaged_warehouse dan company wajib diisi." },
        { status: 400 },
      );
    }

    if (action === "repair") {
      const result = await repairDamagedStock({
        damagedWarehouseId,
        companyId,
        lines,
        userId: auth.userId,
        note,
        repairTarget: body.repair_target ?? "entity",
        targetWarehouseId: body.target_warehouse?.trim(),
      });
      const accounting = (result as { accounting?: unknown }).accounting ?? null;
      return NextResponse.json({ ok: true, action, data: result, accounting });
    }

    const result = await writeOffDamagedStock({
      damagedWarehouseId,
      companyId,
      lines,
      userId: auth.userId,
      note,
    });
    return NextResponse.json({
      ok: true,
      action,
      data: result,
      expense: result.expense,
    });
  } catch (err) {
    return jsonError(err, "Gagal memproses disposisi gudang rusak.");
  }
}
