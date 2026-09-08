"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Send, Ban } from "lucide-react";
import {
  fetchPaymentImportBatch,
  fetchPaymentImportLines,
  postPaymentImportBatch,
  cancelPaymentImportBatch,
  paymentBatchToActivity,
  IMPORT_DISPLAY_STATUS_UI,
} from "@/lib/bisnis/client";
import type { PaymentImportBatch, PaymentImportLine } from "@/lib/bisnis/types";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const LINE_STATUS: Record<string, { label: string; className: string }> = {
  valid: { label: "Valid", className: "text-emerald-700" },
  error: { label: "Gagal", className: "text-red-600" },
  posted: { label: "Dibukukan", className: "text-indigo-700" },
  skipped: { label: "Dilewati", className: "text-amber-700" },
  pending: { label: "Menunggu", className: "text-slate-500" },
};

export default function PelunasanImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<PaymentImportBatch | null>(null);
  const [lines, setLines] = useState<PaymentImportLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postResult, setPostResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [b, ln] = await Promise.all([
        fetchPaymentImportBatch(id),
        fetchPaymentImportLines(id),
      ]);
      setBatch(b);
      setLines(ln);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async () => {
    if (!batch) return;
    if (!confirm(`Batalkan batch ${batch.batch_no}?`)) return;
    try {
      await cancelPaymentImportBatch(batch.id);
      await load();
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    }
  };

  const handlePost = async () => {
    if (!batch) return;
    const validCount = lines.filter(
      (l) => l.validation_status === "valid" && !l.payment,
    ).length;
    if (validCount === 0) {
      alert("Tidak ada baris valid untuk diposting");
      return;
    }
    if (
      !confirm(
        `Posting ${validCount} pembayaran? Invoice akan diperbarui (paid_amount, sisa, status).`,
      )
    ) {
      return;
    }

    setPosting(true);
    setError(null);
    try {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error("Login ulang diperlukan");
      const res = await postPaymentImportBatch(batch.id, userId);
      const errNote =
        res.errors.length > 0 ? ` · ${res.errors.length} gagal` : "";
      setPostResult(`${res.posted} pembayaran dicatat, ${res.skipped} dilewati${errNote}`);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal posting"));
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!batch) {
    return <div className="p-8 text-center text-red-600">{error ?? "Batch tidak ditemukan"}</div>;
  }

  const activity = batch ? paymentBatchToActivity(batch) : null;
  const canPost =
    batch &&
    batch.status !== "cancelled" &&
    activity?.displayStatus !== "success" &&
    lines.some((l) => l.validation_status === "valid" && !l.payment);
  const canCancel = activity?.canCancel ?? false;
  const validTotal = lines
    .filter((l) => l.validation_status === "valid" && !l.payment)
    .reduce((s, l) => s + l.amount, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          href="/bisnis/penjualan/import?jenis=pelunasan"
          className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Import massal
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{batch.batch_no}</h1>
            <p className="text-sm text-slate-500">
              {batch.source_filename ?? "—"} · {lines.length} baris · {batch.valid_rows} valid ·{" "}
              {batch.error_rows} error
              {activity && (
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${IMPORT_DISPLAY_STATUS_UI[activity.displayStatus].className}`}
                >
                  {IMPORT_DISPLAY_STATUS_UI[activity.displayStatus].label} · {activity.progressLabel}
                </span>
              )}
            </p>
            {validTotal > 0 && batch.status !== "posted" && (
              <p className="mt-1 text-sm font-medium text-indigo-700">
                Total akan diposting: {fmt(validTotal)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canCancel && (
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <Ban className="h-4 w-4" />
                Batalkan batch
              </button>
            )}
            {canPost && (
              <button
                type="button"
                onClick={handlePost}
                disabled={posting}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {posting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Posting pelunasan
              </button>
            )}
          </div>
        </div>

        {postResult && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {postResult}
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Pelanggan</th>
                <th className="px-3 py-2">Tgl bayar</th>
                <th className="px-3 py-2 text-right">Jumlah</th>
                <th className="px-3 py-2">Metode</th>
                <th className="px-3 py-2">Referensi</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lines.map((l) => {
                const st = LINE_STATUS[l.validation_status] ?? LINE_STATUS.pending;
                const inv = l.expand?.invoice;
                const customer = inv?.expand?.customer?.name ?? "—";
                const remaining = inv ? inv.remaining : null;
                return (
                  <tr key={l.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 text-slate-500">{l.row_no}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {l.invoice_no}
                      {remaining != null && batch.status !== "posted" && (
                        <span className="ml-1 block text-xs font-normal text-slate-500">
                          Sisa: {fmt(remaining)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{customer}</td>
                    <td className="px-3 py-2">{fmtDate(l.payment_date)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {fmt(l.amount)}
                      {l.lunas_penuh && (
                        <span className="block text-xs text-indigo-600">Lunas penuh</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{l.payment_method_label ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{l.reference_no ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`font-medium ${st.className}`}>{st.label}</span>
                      {l.error_message && (
                        <p className="mt-0.5 max-w-xs text-xs text-red-600">{l.error_message}</p>
                      )}
                      {l.validation_status === "posted" && l.expand?.payment && (
                        <p className="text-xs text-slate-400">Pembayaran tercatat</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
