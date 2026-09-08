"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { completeReturApi } from "@/lib/bisnis/client";
import { parseWmsExceptionSummary } from "@/lib/bisnis/sales-retur-wms-exception";
import { returDisplayNo } from "@/lib/bisnis/retur-display";
import type { Retur } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";

type Props = {
  retur: Retur;
  onCompleted?: () => void | Promise<void>;
};

/**
 * Info exception WMS untuk bisnis.
 * Bantah claim: tidak perlu "kirim ulang ke WMS" — cukup tinjau pernyataan & selesaikan retur.
 */
export function SalesReturWmsExceptionPanel({ retur, onCompleted }: Props) {
  const [busy, setBusy] = useState(false);
  const open = retur.exception_status === "open" && retur.workflow_phase === "awaiting_business";

  if (!open) return null;

  const summary = parseWmsExceptionSummary(retur.wms_exception_summary);
  const reasons = summary?.reasons ?? [];
  const isClaimDispute =
    summary?.exception_type === "claim_dispute" || retur.wms_claim_decision === "disagree";

  const handleComplete = async () => {
    if (
      !confirm(
        "Selesaikan retur? Stok dipindah ke gudang akhir dan pembukuan dijalankan.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await completeReturApi(retur.id);
      await onCompleted?.();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal menyelesaikan retur"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {isClaimDispute
              ? "WMS menolak claim bisnis"
              : "Hasil WMS berbeda dari estimasi"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            {isClaimDispute
              ? `Gudang sudah mencatat sanggahan untuk ${returDisplayNo(retur)}. Claim & instruksi bisnis tidak diubah — lihat kartu klarifikasi WMS di kanan (tetap terlihat saat scroll). Sesuaikan kondisi/pembukuan bila perlu, lalu Simpan atau Selesaikan Retur.`
              : `Penerimaan gudang untuk ${returDisplayNo(retur)} tidak cocok estimasi. Tinjau selisih, sesuaikan data, lalu selesaikan retur.`}
          </p>
          {retur.wms_dispute_note?.trim() ? (
            <p className="mt-2 rounded border border-amber-200 bg-white/70 px-2 py-1.5 text-xs">
              <span className="font-semibold">Sanggahan: </span>
              {retur.wms_dispute_note.trim()}
            </p>
          ) : null}
          {reasons.length > 0 ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-amber-900">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-[11px] text-amber-800/80">
            <strong>Simpan</strong> = simpan dulu tanpa menutup retur.{" "}
            <strong>Selesaikan Retur</strong> = stok + pembukuan final, retur ditutup.
          </p>
        </div>
        {!isClaimDispute ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleComplete()}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Selesaikan retur
          </button>
        ) : null}
      </div>
    </div>
  );
}
