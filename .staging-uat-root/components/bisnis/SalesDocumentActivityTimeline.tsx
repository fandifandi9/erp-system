"use client";

import type { SalesActivityEvent } from "@/lib/bisnis/sales-document-chain";
import { Clock } from "lucide-react";

const KIND_DOT: Record<SalesActivityEvent["kind"], string> = {
  milestone: "bg-indigo-500",
  wms: "bg-sky-500",
  retur: "bg-amber-500",
  finance: "bg-emerald-500",
};

const fmtDate = (d?: string) => {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
};

type Props = {
  events: SalesActivityEvent[];
  loading?: boolean;
};

export function SalesDocumentActivityTimeline({ events, loading }: Props) {
  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
        </div>
        <div className="px-5 py-8 text-center text-sm text-slate-400">Memuat…</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Clock className="h-4 w-4 text-slate-400" />
          Activity
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">Audit trail transaksi</p>
      </div>
      {events.length === 0 ? (
        <div className="px-5 py-6 text-sm text-slate-500">Belum ada aktivitas tercatat.</div>
      ) : (
        <ol className="px-5 py-3">
          {events.map((ev, i) => {
            const time = fmtDate(ev.at);
            return (
              <li key={ev.id} className="relative flex gap-3 pb-4 last:pb-2">
                {i < events.length - 1 ? (
                  <span
                    className="absolute left-[5px] top-3 h-[calc(100%-4px)] w-px bg-slate-200"
                    aria-hidden
                  />
                ) : null}
                <span
                  className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${KIND_DOT[ev.kind]}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{ev.label}</p>
                  {(time || ev.detail) && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[time, ev.detail].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
