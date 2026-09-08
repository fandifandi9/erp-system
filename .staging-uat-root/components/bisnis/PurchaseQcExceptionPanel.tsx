"use client";

import { useState } from "react";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { finalizePurchaseReceivingApi } from "@/lib/bisnis/client";
import { parseQcExceptionSummary } from "@/lib/bisnis/purchase-qc-exception";
import type { PurchaseOrder } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";

type Props = {
  po: PurchaseOrder;
  onFinalized?: () => void | Promise<void>;
};

export function PurchaseQcExceptionPanel({ po, onFinalized }: Props) {
  const [finalizing, setFinalizing] = useState(false);
  const open =
    po.receiving_business_status === "awaiting_business" &&
    (po.exception_status === "open" || po.receiving_discrepancy);

  if (!open) return null;

  const summary = parseQcExceptionSummary(po.qc_exception_summary);
  const reasons = summary?.reasons ?? [];

  const handleFinalize = async () => {
    if (!confirm("Selesaikan penerimaan setelah QC Exception? Stok akan didisposisikan dan tagihan dibuat.")) {
      return;
    }
    setFinalizing(true);
    try {
      await finalizePurchaseReceivingApi(po.id);
      await onFinalized?.();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal menyelesaikan penerimaan"));
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">QC Exception — perlu keputusan bisnis</p>
          <p className="mt-1">
            Hasil QC gudang tidak sesuai estimasi PO ({po.po_no}). Tinjau selisih lalu selesaikan
            penerimaan.
          </p>
          {reasons.length > 0 ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-amber-900">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
          {po.unboxing_video_path ? (
            <p className="mt-2 font-mono text-xs break-all text-slate-600">
              Bukti: {po.unboxing_video_path}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={finalizing}
          onClick={() => void handleFinalize()}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {finalizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Selesaikan penerimaan
        </button>
      </div>
    </div>
  );
}
