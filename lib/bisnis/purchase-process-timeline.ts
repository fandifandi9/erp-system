import type { PurchaseOrder } from "@/lib/bisnis/types";
import { WAREHOUSE_PROCESS_STATUS_UI } from "@/lib/bisnis/purchase-warehouse";
import type { ProcessStepStatus } from "@/lib/bisnis/sales-process-timeline";

export type PurchaseProcessStep = {
  id: string;
  label: string;
  actor?: string;
  at?: string;
  status: ProcessStepStatus;
  detail?: string;
};

function fmtDt(iso?: string): string | undefined {
  if (!iso?.trim()) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatPurchaseProcessStepTime(iso?: string): string | undefined {
  return fmtDt(iso);
}

/** Timeline proses pembelian — dibaca dari PO (bukan input manual). */
export function buildPurchaseProcessTimeline(
  po: Pick<
    PurchaseOrder,
    | "created"
    | "order_date"
    | "status"
    | "send_to_warehouse_at"
    | "warehouse_process_status"
    | "warehouse_processed_at"
    | "warehouse_hold_note"
    | "receiving_business_status"
    | "receiving_discrepancy"
    | "exception_status"
    | "qc_exception_summary"
    | "receiving_auto_proceeded_at"
    | "expand"
  > | null | undefined,
): PurchaseProcessStep[] {
  if (!po) return [];

  const steps: PurchaseProcessStep[] = [];
  const creator =
    po.expand?.created_by?.name?.trim() ||
    po.expand?.created_by?.email?.trim() ||
    undefined;

  steps.push({
    id: "created",
    label: "PO dibuat",
    actor: creator,
    at: po.created ?? po.order_date,
    status: "done",
  });

  if (po.send_to_warehouse_at) {
    steps.push({
      id: "sent_wh",
      label: "Dikirim ke antrean penerimaan",
      at: po.send_to_warehouse_at,
      status: po.warehouse_process_status ? "done" : "active",
    });
  }

  const whStatus = po.warehouse_process_status;
  if (whStatus) {
    const ui = WAREHOUSE_PROCESS_STATUS_UI[whStatus];
    const processor =
      po.expand?.warehouse_processed_by?.name?.trim() ||
      po.expand?.warehouse_processed_by?.email?.trim() ||
      undefined;
    steps.push({
      id: `wh_${whStatus}`,
      label: `Gudang: ${ui.label}`,
      actor: processor,
      at: po.warehouse_processed_at,
      status: whStatus === "complete" ? "done" : whStatus === "hold" ? "active" : "active",
      detail: whStatus === "hold" ? po.warehouse_hold_note?.trim() : undefined,
    });
  }

  if (
    po.exception_status === "open" ||
    (po.receiving_business_status === "awaiting_business" && po.receiving_discrepancy)
  ) {
    steps.push({
      id: "qc_exception",
      label: "QC Exception — menunggu keputusan bisnis",
      status: "active",
      detail: po.qc_exception_summary
        ? (() => {
            try {
              const p = JSON.parse(po.qc_exception_summary!) as { reasons?: string[] };
              return p.reasons?.slice(0, 2).join(" · ");
            } catch {
              return undefined;
            }
          })()
        : undefined,
    });
  } else if (po.receiving_auto_proceeded_at) {
    steps.push({
      id: "qc_auto",
      label: "QC sesuai estimasi — selesai otomatis",
      at: po.receiving_auto_proceeded_at,
      status: "done",
    });
  }

  if (po.status === "received") {
    steps.push({
      id: "received",
      label: "Stok masuk / selesai",
      status: "done",
    });
  }

  return steps;
}
