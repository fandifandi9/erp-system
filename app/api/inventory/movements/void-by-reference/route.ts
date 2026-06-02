import { NextResponse } from "next/server";
import { bizStockNoteMatches } from "@/lib/bisnis/stock-notes";
import { getApiAuthUser, jsonError } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { voidStockMovement } from "@/lib/inventory/stock-engine";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

type RequestBody = {
  reference_id?: string;
  reference_type?: string;
  reference_no?: string;
  note?: string;
  user_id?: string;
};

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function POST(req: Request) {
  try {
    const auth = await getApiAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as RequestBody;
    const referenceId = body.reference_id?.trim();
    const referenceType = body.reference_type?.trim();
    const referenceNo = body.reference_no?.trim();
    if (!referenceId && !referenceNo) {
      return NextResponse.json(
        { ok: false, error: "reference_id atau reference_no wajib diisi." },
        { status: 400 },
      );
    }

    const userId = body.user_id?.trim() || auth.userId;
    const adminPb = await getInventoryAdminPb();

    const filters: string[] = ['status = "posted"'];
    if (referenceNo) {
      filters.push(`notes ~ "${escapeFilterValue(referenceNo)}"`);
    } else if (referenceId) {
      filters.push(`notes ~ "${escapeFilterValue(referenceId)}"`);
    }

    const list = await adminPb.collection(INV_COLLECTIONS.movements).getFullList({
      filter: filters.join(" && "),
      sort: "-created",
    });

    const voided: { movement_id: string; movement_no: string; reversal_id: string }[] = [];

    const candidates = list.filter((row) => {
      const movement = row as {
        reference_id?: string;
        reference_type?: string;
        notes?: string;
      };
      if ((movement.reference_type || "").toUpperCase() === "VOID") return false;

      if (
        referenceType &&
        movement.reference_type &&
        movement.reference_type !== referenceType
      ) {
        return false;
      }

      const matchById = !!referenceId && movement.reference_id === referenceId;
      const matchByNote = bizStockNoteMatches(movement.notes, {
        referenceId,
        referenceType,
        referenceNo,
      });
      return matchById || matchByNote;
    });

    for (const row of candidates) {
      const m = row as { id: string; movement_no: string };
      const result = await voidStockMovement(
        adminPb,
        m.id,
        userId,
        body.note?.trim() || `Void ref ${referenceNo || referenceId}`,
      );
      voided.push({
        movement_id: m.id,
        movement_no: m.movement_no,
        reversal_id: result.reversal_id,
      });
    }

    return NextResponse.json({
      ok: true,
      data: { voided_count: voided.length, scanned_count: list.length, voided },
    });
  } catch (err) {
    return jsonError(err);
  }
}
