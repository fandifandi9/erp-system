import type { PurchaseOrderLine } from "@/lib/bisnis/types";

export type ReceivingLineState = {
  qc_ok: boolean;
  qc_note?: string;
  label_printed: boolean;
  label_print_qty: number;
  putaway_done: boolean;
  /** ID lokasi slot (untuk stok). */
  putaway_location_id?: string;
  /** Kode rak induk — dipilih staff saat susun. */
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
        putaway_done: false,
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
): { qc: number; label: number; putaway: number; total: number } {
  const total = lineIds.length;
  let qc = 0;
  let label = 0;
  let putaway = 0;
  for (const id of lineIds) {
    const s = wf.lines[id];
    if (s?.qc_ok) qc++;
    if (s?.label_printed) label++;
    if (s?.putaway_done) putaway++;
  }
  return { qc, label, putaway, total };
}

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
    if (!s?.putaway_done) {
      return `Konfirmasi putaway untuk "${name}" sebelum menandai Komplit.`;
    }
    if (!s.putaway_location_id) {
      return `Produk "${name}" belum punya ruangan (NEW). Atur penempatan di Daftar Produk / Lokasi Ruangan, lalu konfirmasi putaway.`;
    }
  }
  if (lines.length === 0) return "PO tidak punya item.";
  return null;
}
