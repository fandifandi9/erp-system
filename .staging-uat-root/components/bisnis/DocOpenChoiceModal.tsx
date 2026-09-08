"use client";

import { FileEdit, RotateCcw, X } from "lucide-react";

type Props = {
  open: boolean;
  docNo: string;
  docKind: string;
  canRetur?: boolean;
  loading?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRetur?: () => void;
};

export function DocOpenChoiceModal({
  open,
  docNo,
  docKind,
  canRetur = false,
  loading = false,
  onClose,
  onEdit,
  onRetur,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Nomor sudah ada</h3>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-mono font-medium">{docNo}</span> adalah {docKind} yang sudah
              tercatat. Pilih tindakan:
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onEdit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <FileEdit className="h-4 w-4" />
            Edit dokumen
          </button>
          {canRetur && onRetur ? (
            <button
              type="button"
              disabled={loading}
              onClick={onRetur}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Buat retur
            </button>
          ) : null}
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Batal — nomor baru
          </button>
        </div>
      </div>
    </div>
  );
}
