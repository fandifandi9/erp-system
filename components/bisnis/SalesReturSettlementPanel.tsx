"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { settleSalesReturApi } from "@/lib/bisnis/client";
import {
  SETTLEMENT_OUTGOING_LABELS,
  parseSettlementEstimateJson,
} from "@/lib/bisnis/sales-retur-expected";
import {
  settlementSummaryLines,
  settlementTotals,
} from "@/lib/bisnis/sales-retur-settlement";
import type { Retur } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

type Props = {
  retur: Retur;
  onSettled?: () => void | Promise<void>;
};

function SettlementBreakdown({ retur }: { retur: Retur }) {
  const estimate = parseSettlementEstimateJson(retur.settlement_estimate_json);
  const lines = settlementSummaryLines(retur);
  const totals = settlementTotals(estimate);
  const mpClaim = Number(retur.mp_claim_amount) || 0;
  const shippingReimb = Number(retur.shipping_reimb_amount) || 0;
  const hasLines = lines.length > 0;
  const hasLegacy = mpClaim > 0 || shippingReimb > 0;

  if (!hasLines && !hasLegacy) {
    return (
      <p className="mt-2 text-xs text-slate-600">
        Tidak ada beban / kompensasi tambahan — hanya nilai barang retur.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {hasLines ? (
        <ul className="space-y-1 text-xs">
          {lines.map((l) => {
            const isOut = l.type in SETTLEMENT_OUTGOING_LABELS;
            return (
              <li key={l.type} className="flex justify-between gap-4">
                <span className={isOut ? "text-rose-800" : "text-emerald-800"}>
                  {isOut ? "− " : "+ "}
                  {l.label}
                </span>
                <span className="font-mono tabular-nums">{fmt(l.amount)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!hasLines && hasLegacy ? (
        <ul className="space-y-1 text-xs">
          {mpClaim > 0 ? (
            <li className="flex justify-between gap-4 text-emerald-800">
              <span>+ Kompensasi MP</span>
              <span className="font-mono tabular-nums">{fmt(mpClaim)}</span>
            </li>
          ) : null}
          {shippingReimb > 0 ? (
            <li className="flex justify-between gap-4 text-rose-800">
              <span>− Reimburse ongkir</span>
              <span className="font-mono tabular-nums">{fmt(shippingReimb)}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
      {(totals.outgoingTotal > 0 || totals.incomingTotal > 0) && (
        <div className="flex flex-wrap gap-3 border-t border-slate-200/80 pt-2 text-xs font-semibold">
          {totals.outgoingTotal > 0 ? (
            <span className="text-rose-700">Total beban {fmt(totals.outgoingTotal)}</span>
          ) : null}
          {totals.incomingTotal > 0 ? (
            <span className="text-emerald-700">Total kompensasi {fmt(totals.incomingTotal)}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function SalesReturSettlementPanel({ retur, onSettled }: Props) {
  const [settling, setSettling] = useState(false);
  const awaiting = retur.workflow_phase === "awaiting_settlement" && retur.status !== "completed";
  const completed = retur.status === "completed" || retur.workflow_phase === "completed";

  if (!awaiting && !completed) return null;

  if (completed) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">
        <p className="font-semibold">Riwayat settlement</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Beban & kompensasi yang tercatat saat retur diselesaikan (terpisah dari total barang).
        </p>
        <SettlementBreakdown retur={retur} />
      </div>
    );
  }

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
    <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Settlement retur — {retur.retur_no}</p>
          <p className="mt-1 text-violet-900">
            Stok sudah diposting. Konfirmasi pembukuan beban & recovery di bawah.
          </p>
          {lines.length > 0 ? (
            <SettlementBreakdown retur={retur} />
          ) : (
            <p className="mt-2 text-xs text-violet-800">
              Tidak ada estimasi settlement — akan diposting refund standar.
            </p>
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
