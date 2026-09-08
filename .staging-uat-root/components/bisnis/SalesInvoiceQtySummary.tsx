"use client";

import type { InvoiceQtySummary } from "@/lib/bisnis/sales-document-chain";

const fmtNum = (v: number) => new Intl.NumberFormat("id-ID").format(v);

type Props = {
  summary: InvoiceQtySummary;
};

export function SalesInvoiceQtySummary({ summary }: Props) {
  if (summary.invoiceQty <= 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Ringkasan Qty</h2>
      <p className="mt-0.5 text-xs text-slate-500">Posisi terkini — nilai invoice tidak berubah</p>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoice Qty</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900">{fmtNum(summary.invoiceQty)}</dd>
          <dd className="text-xs text-slate-400">pcs</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Sudah Diretur</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-amber-700">{fmtNum(summary.returnedQty)}</dd>
          <dd className="text-xs text-slate-400">pcs</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Masih Aktif</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-emerald-700">{fmtNum(summary.activeQty)}</dd>
          <dd className="text-xs text-slate-400">pcs</dd>
        </div>
      </dl>
    </section>
  );
}
