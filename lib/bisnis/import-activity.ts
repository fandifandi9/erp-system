import { pb } from "@/lib/pocketbase";
import { fetchPaymentImportBatches } from "./payment-import-client";
import { fetchSalesImportBatches } from "./mp-client";
import { BISNIS_COLLECTIONS, type PaymentImportBatch, type SalesImportLine } from "./types";
import type { SalesImportBatch } from "./types";

export type ImportActivityKind = "penjualan" | "pelunasan";

export type ImportDisplayStatus =
  | "draft"
  | "ready"
  | "cancelled"
  | "success"
  | "partial"
  | "failed";

export type ImportActivityRow = {
  id: string;
  kind: ImportActivityKind;
  batch_no: string;
  created: string;
  source_filename?: string;
  pbStatus: string;
  displayStatus: ImportDisplayStatus;
  /** Contoh: "6 dari 6" atau "2 dari 5" */
  progressLabel: string;
  targetCount: number;
  doneCount: number;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  href: string;
  canCancel: boolean;
};

export function salesImportTargets(lines: SalesImportLine[]) {
  const validOrders = new Set(
    lines.filter((l) => l.validation_status === "valid").map((l) => l.mp_order_no),
  );
  const postedOrders = new Set(
    lines.filter((l) => l.validation_status === "posted").map((l) => l.mp_order_no),
  );
  return {
    target: validOrders.size,
    done: postedOrders.size,
  };
}

export function paymentImportTargets(batch: PaymentImportBatch) {
  return { target: batch.valid_rows, done: batch.posted_rows };
}

export function resolveImportDisplayStatus(
  pbStatus: string,
  target: number,
  done: number,
): ImportDisplayStatus {
  if (pbStatus === "cancelled") return "cancelled";
  if (pbStatus === "draft") return "draft";
  if (pbStatus === "validated") return "ready";
  if (pbStatus === "posted" || done > 0) {
    if (target > 0 && done >= target) return "success";
    if (done > 0) return "partial";
    return "failed";
  }
  return "draft";
}

export function formatProgressLabel(target: number, done: number, pbStatus: string): string {
  if (pbStatus === "cancelled") return "—";
  if (pbStatus === "draft" || pbStatus === "validated") {
    return target > 0 ? `${target} siap` : `${done} dari ${target || "?"}`;
  }
  return `${done} dari ${target || done || "?"}`;
}

export function canCancelImportBatch(pbStatus: string, done: number): boolean {
  return (pbStatus === "draft" || pbStatus === "validated") && done === 0;
}

export function salesBatchToActivity(
  batch: SalesImportBatch,
  lines: SalesImportLine[],
): ImportActivityRow {
  const { target, done } = salesImportTargets(lines);
  const displayStatus = resolveImportDisplayStatus(batch.status, target, done);
  return {
    id: batch.id,
    kind: "penjualan",
    batch_no: batch.batch_no,
    created: batch.created,
    source_filename: batch.source_filename,
    pbStatus: batch.status,
    displayStatus,
    progressLabel: formatProgressLabel(target, done, batch.status),
    targetCount: target,
    doneCount: done,
    total_rows: batch.total_rows,
    valid_rows: batch.valid_rows,
    error_rows: batch.error_rows,
    href: `/bisnis/penjualan/import/${batch.id}`,
    canCancel: canCancelImportBatch(batch.status, done),
  };
}

export function paymentBatchToActivity(batch: PaymentImportBatch): ImportActivityRow {
  const { target, done } = paymentImportTargets(batch);
  const displayStatus = resolveImportDisplayStatus(batch.status, target, done);
  return {
    id: batch.id,
    kind: "pelunasan",
    batch_no: batch.batch_no,
    created: batch.created,
    source_filename: batch.source_filename,
    pbStatus: batch.status,
    displayStatus,
    progressLabel: formatProgressLabel(target, done, batch.status),
    targetCount: target,
    doneCount: done,
    total_rows: batch.total_rows,
    valid_rows: batch.valid_rows,
    error_rows: batch.error_rows,
    href: `/bisnis/penjualan/pelunasan-import/${batch.id}`,
    canCancel: canCancelImportBatch(batch.status, done),
  };
}

export async function fetchImportActivityRows(opts?: {
  perPage?: number;
}): Promise<ImportActivityRow[]> {
  const perPage = opts?.perPage ?? 40;
  const [salesRes, payRes] = await Promise.all([
    fetchSalesImportBatches({ page: 1, perPage }),
    fetchPaymentImportBatches({ page: 1, perPage }),
  ]);

  const salesIds = salesRes.items.map((b) => b.id);
  const linesByBatch = new Map<string, SalesImportLine[]>();

  if (salesIds.length > 0) {
    const filter = salesIds.map((id) => `batch = "${id}"`).join(" || ");
    const allLines = await pb.collection(BISNIS_COLLECTIONS.salesImportLines).getFullList<SalesImportLine>({
      filter,
      fields: "id,batch,mp_order_no,validation_status",
      requestKey: null,
    });
    for (const line of allLines) {
      const list = linesByBatch.get(line.batch) ?? [];
      list.push(line);
      linesByBatch.set(line.batch, list);
    }
  }

  const rows: ImportActivityRow[] = [
    ...salesRes.items.map((b) => salesBatchToActivity(b, linesByBatch.get(b.id) ?? [])),
    ...payRes.items.map((b) => paymentBatchToActivity(b)),
  ];

  rows.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  return rows;
}

export const IMPORT_DISPLAY_STATUS_UI: Record<
  ImportDisplayStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700" },
  ready: { label: "Siap posting", className: "bg-amber-100 text-amber-800" },
  cancelled: { label: "Dibatalkan", className: "bg-red-100 text-red-700" },
  success: { label: "Selesai", className: "bg-emerald-100 text-emerald-800" },
  partial: { label: "Sebagian", className: "bg-orange-100 text-orange-800" },
  failed: { label: "Gagal", className: "bg-red-100 text-red-800" },
};
