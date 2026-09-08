"use client";

import { CheckCircle2, Printer, Plus, ExternalLink, X } from "lucide-react";

type Props = {
  open: boolean;
  docNo: string;
  docLabel?: string;
  isCreate?: boolean;
  onClose: () => void;
  onPrint: () => void;
  onNew?: () => void;
  onViewDetail?: () => void;
};

export function PostSaveDocModal({
  open,
  docNo,
  docLabel = "Dokumen",
  isCreate = true,
  onClose,
  onPrint,
  onNew,
  onViewDetail,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {isCreate ? "Berhasil disimpan" : "Perubahan disimpan"}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {docLabel}{" "}
                <span className="font-mono font-medium text-slate-900">{docNo}</span>{" "}
                {isCreate ? "telah dibuat." : "telah diperbarui."}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Printer className="h-4 w-4" />
            Cetak
          </button>
          {onNew ? (
            <button
              type="button"
              onClick={onNew}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Buat baru
            </button>
          ) : null}
          {onViewDetail ? (
            <button
              type="button"
              onClick={onViewDetail}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" />
              Lihat detail
            </button>
          ) : null}
          {!onNew ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              Tutup &amp; lanjut edit
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
