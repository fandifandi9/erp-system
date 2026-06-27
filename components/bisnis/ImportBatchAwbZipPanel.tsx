"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Package, Upload } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

type AwbSummary = {
  total_orders: number;
  posted_orders: number;
  with_awb_file: number;
  pending_awb: number;
};

type ZipResult = {
  matched: number;
  uploaded: number;
  skipped: number;
  unmatched: string[];
  errors: { file: string; message: string }[];
};

type Props = {
  batchId: string;
  batchPosted: boolean;
};

export function ImportBatchAwbZipPanel({ batchId, batchPosted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<AwbSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ZipResult | null>(null);

  const load = useCallback(async () => {
    if (!batchPosted) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/bisnis/import-batches/${batchId}/awb-zip`, {
        credentials: "include",
      });
      const data = (await res.json()) as { summary?: AwbSummary; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat status AWB");
      setSummary(data.summary ?? null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [batchId, batchPosted]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleZip = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/bisnis/import-batches/${batchId}/awb-zip`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await res.json()) as {
        result?: ZipResult;
        summary?: AwbSummary;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Upload ZIP gagal");
      setResult(data.result ?? null);
      setSummary(data.summary ?? null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  if (!batchPosted) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Label AWB (ZIP)</p>
        <p className="mt-1 text-xs">
          Setelah batch diposting ke invoice, unggah ZIP berisi PDF AWB dari marketplace. Nama file =
          nomor pesanan MP atau nomor resi.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-indigo-950">
            <Package className="h-4 w-4" />
            Upload label AWB (ZIP)
          </p>
          <p className="mt-1 text-xs text-indigo-900/80">
            PDF/gambar dalam ZIP — cocokkan otomatis dengan <strong>mp_order_no</strong> atau{" "}
            <strong>no_resi</strong> dari Excel.
          </p>
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-indigo-500" /> : null}
      </div>

      {summary ? (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
          <Stat label="Order diposting" value={String(summary.posted_orders)} />
          <Stat label="Sudah ada AWB" value={String(summary.with_awb_file)} color="text-emerald-700" />
          <Stat label="Belum AWB" value={String(summary.pending_awb)} color="text-amber-700" />
          <Stat label="Total order" value={String(summary.total_orders)} />
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700">
          <p>
            <strong>{result.uploaded}</strong> label diunggah · {result.matched} cocok ·{" "}
            {result.skipped} dilewati (sudah ada)
          </p>
          {result.unmatched.length > 0 ? (
            <p className="mt-1 text-amber-800">
              Tidak cocok ({result.unmatched.length}): {result.unmatched.slice(0, 5).join(", ")}
              {result.unmatched.length > 5 ? "…" : ""}
            </p>
          ) : null}
          {result.errors.length > 0 ? (
            <p className="mt-1 text-red-600">
              Error: {result.errors.map((e) => `${e.file}: ${e.message}`).join("; ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Pilih file ZIP
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          void handleZip(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-white/80 px-3 py-2 ring-1 ring-indigo-100">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${color ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}
