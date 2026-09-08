"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { completeReturApi } from "@/lib/bisnis/client";
import { parseWmsExceptionSummary } from "@/lib/bisnis/sales-retur-wms-exception";
import type { Retur } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";

type Props = {
  retur: Retur;
  onCompleted?: () => void | Promise<void>;
};

export function SalesReturWmsExceptionPanel({ retur, onCompleted }: Props) {
  const [completing, setCompleting] = useState(false);
  const open = retur.exception_status === "open" && retur.workflow_phase === "awaiting_business";

  if (!open) return null;

  const summary = parseWmsExceptionSummary(retur.wms_exception_summary);
  const reasons = summary?.reasons ?? [];

  const handleComplete = async () => {
    if (
      !confirm(
        "Selesaikan retur setelah WMS Exception? Stok akan dipindah ke gudang akhir dan pembukuan dijalankan.",
      )
    ) {
      return;
    }
    setCompleting(true);
    try {
      await completeReturApi(retur.id);
      await onCompleted?.();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal menyelesaikan retur"));
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">WMS Exception — perlu keputusan bisnis</p>
          <p className="mt-1">
            Hasil penerimaan gudang tidak sesuai estimasi retur ({retur.retur_no}). Tinjau selisih lalu
            selesaikan retur.
          </p>
          {reasons.length > 0 ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-amber-900">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          disabled={completing}
          onClick={() => void handleComplete()}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {completing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Selesaikan retur
        </button>
      </div>
    </div>
  );
}
