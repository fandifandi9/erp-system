"use client";

import Link from "next/link";
import { FileText, Link2 } from "lucide-react";
import type { SalesChainDocument } from "@/lib/bisnis/sales-document-chain";

const KIND_LABEL: Record<SalesChainDocument["kind"], string> = {
  sales_order: "Pesanan penjualan",
  invoice: "Faktur",
  sales_return: "Retur penjualan",
  credit_note: "Nota kredit",
  refund: "Pengembalian",
  recovery: "Pemulihan",
  expense: "Pelunasan",
};

const KIND_BADGE: Record<SalesChainDocument["kind"], string> = {
  sales_order: "bg-slate-100 text-slate-700",
  invoice: "bg-indigo-50 text-indigo-800",
  sales_return: "bg-amber-50 text-amber-900",
  credit_note: "bg-rose-50 text-rose-800",
  refund: "bg-orange-50 text-orange-900",
  recovery: "bg-emerald-50 text-emerald-800",
  expense: "bg-violet-50 text-violet-800",
};

const fmt = (v?: number) =>
  v != null && v > 0
    ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v)
    : null;

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
    : null;

type Props = {
  documents: SalesChainDocument[];
  loading?: boolean;
};

export function SalesDocumentChainPanel({ documents, loading }: Props) {
  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Dokumen terkait</h2>
        </div>
        <div className="px-5 py-8 text-center text-sm text-slate-400">Memuat…</div>
      </section>
    );
  }

  if (documents.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Dokumen terkait</h2>
          <p className="mt-0.5 text-xs text-slate-500">Rangkaian dokumen terkait transaksi ini</p>
        </div>
        <div className="px-5 py-6 text-sm text-slate-500">Belum ada dokumen terkait.</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Link2 className="h-4 w-4 text-slate-400" />
          Dokumen terkait
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">{documents.length} dokumen dalam rantai transaksi</p>
      </div>
      <ol className="divide-y divide-slate-100">
        {documents.map((doc, idx) => {
          const amount = fmt(doc.amount);
          const date = fmtDate(doc.date);
          const inner = (
            <>
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-400">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_BADGE[doc.kind]}`}>
                      {KIND_LABEL[doc.kind]}
                    </span>
                    {doc.status === "estimated" ? (
                      <span className="text-[10px] text-slate-400">estimasi</span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{doc.docNo}</p>
                  {(date || amount || doc.parentReturNo) && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[date, amount, doc.parentReturNo ? `↳ ${doc.parentReturNo}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              {idx < documents.length - 1 ? (
                <div className="ml-3 mt-2 h-3 border-l border-dashed border-slate-200" aria-hidden />
              ) : null}
            </>
          );

          return (
            <li key={doc.id} className="px-5 py-3">
              {doc.href ? (
                <Link href={doc.href} className="block rounded-lg transition hover:bg-slate-50/80">
                  {inner}
                </Link>
              ) : (
                <div>{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
