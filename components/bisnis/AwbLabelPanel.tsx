"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Printer, Trash2, Upload } from "lucide-react";
import {
  fetchAwbLabelInfo,
  peekAwbLabelCache,
  removeAwbLabel,
  uploadAwbLabel,
  type AwbLabelInfo,
} from "@/lib/bisnis/awb-label-client";
import { awbSourceLabel, validateAwbLabelFile } from "@/lib/bisnis/awb-label";
import { getErrorMessage } from "@/lib/errors";
import type { AwbSource } from "@/lib/bisnis/awb-label";

type Props = {
  salesOrderId?: string | null;
  /** Mode buat order baru — file disimpan sementara sampai SO tersimpan. */
  pendingFile?: File | null;
  onPendingFileChange?: (file: File | null) => void;
  disabled?: boolean;
  uploadSource?: AwbSource;
  compact?: boolean;
  onUploaded?: () => void;
  /** Preview — tampilkan info/file saja, tanpa upload/hapus. */
  readOnly?: boolean;
};

export function AwbLabelPanel({
  salesOrderId,
  pendingFile,
  onPendingFileChange,
  disabled = false,
  uploadSource = "manual",
  compact = false,
  onUploaded,
  readOnly = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cached = salesOrderId ? peekAwbLabelCache(salesOrderId) : null;
  const [info, setInfo] = useState<AwbLabelInfo | null>(cached);
  const [loading, setLoading] = useState(!cached && !!salesOrderId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const isPendingMode = !salesOrderId;

  const load = useCallback(async () => {
    if (!salesOrderId) return;
    setLoading(true);
    setError("");
    try {
      setInfo(await fetchAwbLabelInfo(salesOrderId));
    } catch (e) {
      setError(getErrorMessage(e));
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [salesOrderId]);

  useEffect(() => {
    if (!salesOrderId) {
      setInfo(null);
      return;
    }
    const hit = peekAwbLabelCache(salesOrderId);
    if (hit) {
      setInfo(hit);
      setLoading(false);
      return;
    }
    void load();
  }, [salesOrderId, load]);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const msg = validateAwbLabelFile(file);
    if (msg) {
      setError(msg);
      return;
    }
    setError("");
    if (isPendingMode) {
      onPendingFileChange?.(file);
      return;
    }
    if (!salesOrderId) return;
    setUploading(true);
    try {
      await uploadAwbLabel(salesOrderId, file, uploadSource);
      await load();
      onUploaded?.();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (isPendingMode) {
      onPendingFileChange?.(null);
      return;
    }
    if (!salesOrderId || !info?.has_file) return;
    if (!window.confirm("Hapus file label AWB dari order ini?")) return;
    setUploading(true);
    setError("");
    try {
      await removeAwbLabel(salesOrderId);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = info?.url ?? null;
  const displayName = isPendingMode
    ? pendingFile?.name
    : info?.filename ?? null;
  const hasFile = isPendingMode ? !!pendingFile : !!info?.has_file;

  return (
    <div
      className={
        compact
          ? "rounded-lg border border-slate-200 bg-slate-50/80 p-3"
          : "rounded-lg border border-indigo-100 bg-indigo-50/40 p-4"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">Label AWB (PDF / gambar)</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {isPendingMode
              ? "Unggah label dari MP/kurir — tersimpan setelah order disimpan."
              : "Digunakan gudang untuk cetak label di Packing + QC."}
          </p>
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>

      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {hasFile ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
            <FileText className="h-3.5 w-3.5 text-indigo-600" />
            <span className="max-w-[200px] truncate">{displayName}</span>
          </span>
          {!isPendingMode && displayUrl ? (
            <>
              <a
                href={displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
              >
                Lihat
              </a>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => {
                    const w = window.open(displayUrl, "_blank");
                    w?.addEventListener("load", () => w.print());
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Cetak
                </button>
              ) : null}
            </>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => void handleRemove()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Hapus
            </button>
          ) : null}
        </div>
      ) : readOnly ? (
        loading ? (
          <p className="mt-3 text-xs text-slate-500">Memuat label AWB…</p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">Belum ada label AWB.</p>
        )
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Unggah label AWB
        </button>
      )}

      {!isPendingMode && info?.awb_ready_at ? (
        <p className="mt-2 text-[10px] text-slate-500">
          Siap cetak · {awbSourceLabel(info.awb_source)}
          {info.tracking_no ? ` · Resi ${info.tracking_no}` : ""}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
