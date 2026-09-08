"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { settleSalesReturApi } from "@/lib/bisnis/client";
import { settlementSummaryLines } from "@/lib/bisnis/sales-retur-settlement";
import type { Retur } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

type Props = {
  retur: Retur;
  onSettled?: () => void | Promise<void>;
};

export function SalesReturSettlementPanel({ retur, onSettled }: Props) {
  const [settling, setSettling] = useState(false);
  const open = retur.workflow_phase === "awaiting_settlement" && retur.status !== "completed";

  if (!open) return null;

  const lines = settlementSummaryLines(retur);

  const handleSettle = async () => {
    if (!confirm("Jalankan settlement retur? Pembukuan akan diposting sesuai estimasi.")) return;
    setSettling(true);
    try {
      await settleSalesReturApi(retur.id);
      await onSettled?.();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal settlement"));
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Settlement retur — {retur.retur_no}</p>
          <p className="mt-1 text-violet-900">
            Stok sudah diposting. Konfirmasi pembukuan beban & recovery di bawah.
          </p>
          {lines.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs">
              {lines.map((l) => (
                <li key={l.type} className="flex justify-between gap-4">
                  <span>{l.label}</span>
                  <span className="font-mono">{fmt(l.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-violet-800">Tidak ada estimasi settlement — akan diposting refund standar.</p>
          )}
        </div>
        <button
          type="button"
          disabled={settling}
          onClick={() => void handleSettle()}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {settling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
          Posting settlement
        </button>
      </div>
    </div>
  );
}
