"use client";

import { ExternalLink } from "lucide-react";

type ShareOpenGateProps = {
  docLabel: string;
  docNo: string;
  partyLabel: string;
  partyName: string;
  previewHref: string;
};

/** Landing link WA/email — tombol membuka pratinjau di tab baru (WA Web tidak tertimpa). */
export function ShareOpenGate({
  docLabel,
  docNo,
  partyLabel,
  partyName,
  previewHref,
}: ShareOpenGateProps) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          {docLabel}
        </p>
        <h1 className="mt-2 font-mono text-xl font-bold text-slate-900">{docNo}</h1>
        <p className="mt-3 text-sm text-slate-600">
          {partyLabel}: <strong className="text-slate-800">{partyName}</strong>
        </p>
        <p className="mt-4 text-sm leading-relaxed text-slate-500">
          Klik tombol di bawah untuk membuka pratinjau di <strong>tab baru</strong>, sehingga
          WhatsApp Web tetap terbuka.
        </p>
        <a
          href={previewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <ExternalLink className="h-4 w-4" />
          Buka pratinjau
        </a>
      </div>
    </div>
  );
}
