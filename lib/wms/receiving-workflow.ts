import type { PurchaseOrderLine } from "@/lib/bisnis/types";

export type ReceivingLineState = {
  qc_ok: boolean;
  qc_note?: string;
  /** Qty rusak/cacat — dipindah ke gudang rusak saat komplit (sisanya ke gudang entitas). */
  damaged_qty?: number;
  label_printed: boolean;
  label_print_qty: number;
  /** @deprecated Tidak dipakai — stok per gudang saja, tanpa slot. */
  putaway_done?: boolean;
  putaway_location_id?: string;
  putaway_rack_code?: string;
  putaway_level?: string;
  putaway_slot?: string;
};

export type ReceivingWorkflow = {
  lines: Record<string, ReceivingLineState>;
  updated_at?: string;
};

export function parseReceivingWorkflow(raw?: string | null): ReceivingWorkflow {
  if (!raw?.trim()) return { lines: {} };
  try {
    const parsed = JSON.parse(raw) as ReceivingWorkflow;
    if (!parsed || typeof parsed !== "object" || !parsed.lines) return { lines: {} };
    return parsed;
  } catch {
    return { lines: {} };
  }
}

export function serializeReceivingWorkflow(wf: ReceivingWorkflow): string {
  return JSON.stringify({ ...wf, updated_at: new Date().toISOString() });
}

export function mergeWorkflowWithLines(
  wf: ReceivingWorkflow,
  lineIds: string[],
  defaultQtyByLine: Record<string, number>,
): ReceivingWorkflow {
  const lines = { ...wf.lines };
  for (const id of lineIds) {
    if (!lines[id]) {
      lines[id] = {
        qc_ok: false,
        label_printed: false,
        label_print_qty: defaultQtyByLine[id] ?? 1,
      };
    } else if (!lines[id].label_print_qty) {
      lines[id].label_print_qty = defaultQtyByLine[id] ?? 1;
    }
  }
  return { lines };
}

export function countWorkflowProgress(
  lineIds: string[],
  wf: ReceivingWorkflow,
): { qc: number; label: number; total: number } {
  const total = lineIds.length;
  let qc = 0;
  let label = 0;
  for (const id of lineIds) {
    const s = wf.lines[id];
    if (s?.qc_ok) qc++;
    if (s?.label_printed) label++;
  }
  return { qc, label, total };
}

/** Selesai penerimaan: QC lulus semua item; qty rusak tidak melebihi qty PO. */
export function validateReceivingWorkflowComplete(
  lines: PurchaseOrderLine[],
  wf: ReceivingWorkflow,
): string | null {
  for (const line of lines) {
    const name = line.expand?.product?.name ?? "produk";
    const s = wf.lines[line.id];
    if (!s?.qc_ok) {
      return `Centang QC untuk "${name}" sebelum menandai Komplit.`;
    }
    const damagedQty = Math.max(0, Number(s.damaged_qty) || 0);
    if (damagedQty > line.qty) {
      return `Qty rusak "${name}" (${damagedQty}) melebihi qty PO (${line.qty}).`;
    }
  }
  if (lines.length === 0) return "PO tidak punya item.";
  return null;
}

export function isReceivingWorkflowReady(lineIds: string[], wf: ReceivingWorkflow): boolean {
  if (lineIds.length === 0) return false;
  const p = countWorkflowProgress(lineIds, wf);
  return p.qc === p.total;
}
