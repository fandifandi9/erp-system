import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import {
  getDamagedWarehouse,
  getTransitWarehouse,
} from "@/lib/bisnis/entity-modules";
import { createAutoTransferMovement } from "@/lib/bisnis/client";
import {
  parseReceivingWorkflow,
  type ReceivingWorkflow,
} from "@/lib/wms/receiving-workflow";
import type { PurchaseOrder, PurchaseOrderLine } from "./types";

export type DispositionLine = { product: string; qty: number };

function aggregateLines(lines: DispositionLine[]): DispositionLine[] {
  const map = new Map<string, number>();
  for (const l of lines) {
    if (!l.product || l.qty <= 0) continue;
    map.set(l.product, (map.get(l.product) ?? 0) + l.qty);
  }
  return [...map.entries()].map(([product, qty]) => ({ product, qty }));
}

/** Resolve entitas pemilik PO — dari field company atau gudang entitas. */
export async function resolvePurchaseOrderCompanyId(
  po: Pick<PurchaseOrder, "company" | "warehouse">,
): Promise<string> {
  if (po.company) return po.company;
  if (!po.warehouse) return "";
  try {
    const wh = await pb.collection(INV_COLLECTIONS.warehouses).getOne<{ company?: string }>(
      po.warehouse,
      { fields: "company", requestKey: null },
    );
    return wh.company ?? "";
  } catch {
    return "";
  }
}

/** Gudang tujuan posting stok pembelian: transit untuk WMS, main untuk non-WMS. */
export async function resolvePurchaseStockWarehouse(
  po: Pick<PurchaseOrder, "company" | "warehouse" | "send_to_warehouse_at">,
): Promise<string> {
  if (!po.warehouse) return "";
  if (!po.send_to_warehouse_at) return po.warehouse;

  const companyId = await resolvePurchaseOrderCompanyId(po);
  if (!companyId) {
    throw new Error("PO lewat WMS wajib punya entitas — tentukan entitas pembeli.");
  }
  const transit = await getTransitWarehouse(companyId);
  if (!transit) {
    throw new Error(
      "Buat gudang sementara untuk entitas ini (Gudang → Daftar Gudang) sebelum menyelesaikan penerimaan WMS.",
    );
  }
  return transit.id;
}

/**
 * Setelah stok masuk gudang sementara: pindahkan qty lulus QC → gudang entitas,
 * qty rusak → gudang rusak (TRANSFER).
 */
export async function applyReceivingDisposition(
  po: PurchaseOrder,
  lines: PurchaseOrderLine[],
  userId: string,
  wf?: ReceivingWorkflow,
): Promise<void> {
  if (!po.send_to_warehouse_at || !po.warehouse) return;

  const workflow = wf ?? parseReceivingWorkflow(po.receiving_workflow_json);
  const companyId = await resolvePurchaseOrderCompanyId(po);
  if (!companyId) return;

  const transit = await getTransitWarehouse(companyId);
  if (!transit) return;

  const passLines: DispositionLine[] = [];
  const damagedLines: DispositionLine[] = [];

  for (const line of lines) {
    const st = workflow.lines[line.id];
    const qty = Number(line.qty) || 0;
    if (qty <= 0) continue;
    const damagedQty = Math.min(Math.max(0, Number(st?.damaged_qty) || 0), qty);
    const passQty = qty - damagedQty;
    if (passQty > 0) passLines.push({ product: line.product, qty: passQty });
    if (damagedQty > 0) damagedLines.push({ product: line.product, qty: damagedQty });
  }

  if (damagedLines.length) {
    const damagedWh = await getDamagedWarehouse(companyId);
    if (!damagedWh) {
      throw new Error(
        "Ada barang rusak di QC — buat gudang rusak untuk entitas ini atau set qty rusak = 0.",
      );
    }
    await createAutoTransferMovement({
      from_warehouse: transit.id,
      to_warehouse: damagedWh.id,
      reference_type: "PURCHASE_QC_DAMAGED",
      reference_id: po.id,
      reference_no: po.po_no,
      lines: aggregateLines(damagedLines),
      note_suffix: "QC rusak → gudang rusak",
    });
  }

  const aggregatedPass = aggregateLines(passLines);
  if (aggregatedPass.length) {
    await createAutoTransferMovement({
      from_warehouse: transit.id,
      to_warehouse: po.warehouse,
      reference_type: "PURCHASE_QC_PASS",
      reference_id: po.id,
      reference_no: po.po_no,
      lines: aggregatedPass,
      note_suffix: "QC lulus → gudang entitas",
    });
  }
}
