import type PocketBase from "pocketbase";
import { nextDocNoFor } from "@/lib/bisnis/doc-number";
import {
  assertPurchaseReturEligible,
  canCreatePurchaseRetur,
  sumReturnedQtyForPoLine,
} from "@/lib/bisnis/purchase-retur-guards";
import {
  BISNIS_COLLECTIONS,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type Retur,
  type ReturLine,
} from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { notifyUserInApp } from "@/lib/tenant/notify-user";

export { canCreatePurchaseRetur } from "@/lib/bisnis/purchase-retur-guards";

async function enqueuePurchaseReturnWmsTask(
  pb: PocketBase,
  input: {
    retur: Retur;
    lines: ReturLine[];
    poNo: string;
    mainWarehouseId: string;
    userId: string;
  },
) {
  try {
    await pb.collection(INV_COLLECTIONS.staffActivities).create({
      user: input.userId,
      warehouse: input.mainWarehouseId,
      activity_type: "wms.purchase_return_prepare",
      entity_type: "biz_returs",
      entity_id: input.retur.id,
      payload: {
        retur_no: input.retur.retur_no,
        po_no: input.poNo,
        reason: input.retur.reason ?? "",
        status: "pending",
        note: "Siapkan barang retur pembelian dari gudang utama untuk dikirim ke supplier.",
        lines: input.lines.map((l) => ({
          product: l.product,
          qty: l.qty,
          name: l.expand?.product?.name,
        })),
      },
      occurred_at: new Date().toISOString(),
      device_platform: "web",
    });
  } catch {
    /* audit opsional */
  }
}

export async function createPurchaseReturFromOrder(
  pb: PocketBase,
  purchaseOrderId: string,
  userId: string,
  opts?: { reason?: string },
): Promise<{ retur: Retur; lines: ReturLine[] }> {
  const po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(purchaseOrderId);
  if (!canCreatePurchaseRetur(po)) {
    throw new Error(`PO status "${po.status}" belum bisa diretur.`);
  }

  const bill = await assertPurchaseReturEligible(pb, purchaseOrderId, po.po_no);

  const poLines = await pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).getFullList<PurchaseOrderLine>({
    filter: `purchase_order = "${purchaseOrderId}"`,
    sort: "created",
    requestKey: null,
  });
  if (!poLines.length) throw new Error("PO tidak punya barang.");

  const draftLines: { sol: PurchaseOrderLine; qty: number }[] = [];
  for (const sol of poLines) {
    const already = await sumReturnedQtyForPoLine(pb, sol.id);
    const remaining = (Number(sol.qty) || 0) - already;
    if (remaining > 0) draftLines.push({ sol, qty: remaining });
  }
  if (!draftLines.length) throw new Error("Semua barang PO sudah diretur.");

  const returNo = await nextDocNoFor("ret");
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).create<Retur>({
    retur_no: returNo,
    type: "pembelian",
    status: "draft",
    workflow_phase: "awaiting_wms",
    purchase_order: purchaseOrderId,
    reference_id: purchaseOrderId,
    purchase_bill: bill.id,
    supplier: po.supplier,
    warehouse: po.warehouse,
    reason: opts?.reason?.trim() || "",
    total: 0,
    created_by: userId,
  });

  const lines: ReturLine[] = [];
  for (const { sol, qty } of draftLines) {
    const unitCost = sol.unit_cost;
    const line = await pb.collection(BISNIS_COLLECTIONS.returLines).create<ReturLine>({
      retur: retur.id,
      product: sol.product,
      qty,
      unit_price: unitCost,
      line_total: sol.line_total
        ? Math.round((sol.line_total / (Number(sol.qty) || 1)) * qty)
        : Math.round(unitCost * qty),
      condition: "good",
      purchase_order_line: sol.id,
      reason: "",
    });
    lines.push(line);
  }

  if (po.warehouse) {
    await enqueuePurchaseReturnWmsTask(pb, {
      retur,
      lines,
      poNo: po.po_no,
      mainWarehouseId: po.warehouse,
      userId,
    });
  }

  return { retur, lines };
}

/** WMS siapkan retur pembelian (pick dari gudang utama). */
export async function preparePurchaseReturnAtWms(
  pb: PocketBase,
  returId: string,
  userId: string,
  opts?: { unboxing_video_path?: string; wms_note?: string },
): Promise<Retur> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.type !== "pembelian" || retur.workflow_phase !== "awaiting_wms") {
    throw new Error("Retur pembelian tidak siap untuk persiapan WMS.");
  }

  const tasks = await pb.collection(INV_COLLECTIONS.staffActivities).getFullList({
    filter: `entity_type = "biz_returs" && entity_id = "${returId}" && activity_type = "wms.purchase_return_prepare"`,
    requestKey: null,
  });
  for (const row of tasks) {
    const r = row as { id: string; payload?: Record<string, unknown> };
    try {
      await pb.collection(INV_COLLECTIONS.staffActivities).update(r.id, {
        payload: {
          ...(r.payload ?? {}),
          status: "complete",
          completed_by: userId,
          unboxing_video_path: opts?.unboxing_video_path,
          wms_note: opts?.wms_note,
        },
      });
    } catch {
      /* ignore */
    }
  }

  const updated = await pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
    workflow_phase: "awaiting_business",
    unboxing_video_path: opts?.unboxing_video_path || retur.unboxing_video_path,
    reminder_due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
  });

  if (retur.created_by) {
    await notifyUserInApp(pb, {
      userId: retur.created_by,
      event_code: "retur.purchase.wms_prepared",
      module: "purchase",
      severity: "info",
      entity_type: "biz_returs",
      entity_id: retur.id,
      entity_label: retur.retur_no,
      actor_id: userId,
      payload: {
        action_url: `/bisnis/retur/${retur.id}`,
        retur_no: retur.retur_no,
      },
      dedupe_key: `pretur-wms-${retur.id}`,
    });
  }

  return updated;
}
