"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Send } from "lucide-react";
import {
  fetchSalesImportBatch,
  fetchSalesImportLines,
  postSalesImportBatch,
} from "@/lib/bisnis/client";
import type { SalesImportBatch, SalesImportLine } from "@/lib/bisnis/types";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function ImportBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<SalesImportBatch | null>(null);
  const [lines, setLines] = useState<SalesImportLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postResult, setPostResult] = useState<string | null>(null);
  const [sendToPicking, setSendToPicking] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [b, ln] = await Promise.all([fetchSalesImportBatch(id), fetchSalesImportLines(id)]);
      setBatch(b);
      setLines(ln);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handlePost = async () => {
    if (!batch || batch.status === "posted") return;
    const validOrders = new Set(lines.filter((l) => l.validation_status === "valid").map((l) => l.mp_order_no));
    if (validOrders.size === 0) {
      alert("Tidak ada baris valid untuk diposting");
      return;
    }
    if (!confirm(`Posting ${validOrders.size} order menjadi invoice? Stok akan dikurangi.`)) return;

    setPosting(true);
    setError(null);
    try {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error("Login ulang diperlukan");
      const res = await postSalesImportBatch(batch.id, userId, { sendToPicking });
      setPostResult(`${res.posted} invoice dibuat, ${res.skipped} dilewati`);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal posting"));
    } finally {
      setPosting(false);
    }
  };

  const orderGroups = groupByOrder(lines);

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

  const canPost = batch.status !== "posted" && lines.some((l) => l.validation_status === "valid");

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link href="/bisnis/penjualan-online/import" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Import
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{batch.batch_no}</h1>
            <p className="text-sm text-slate-500">
              {batch.expand?.store_channel_account?.account_name} · {fmtDate(batch.period_from)} – {fmtDate(batch.period_to)}
              {batch.expand?.fee_template?.name && (
                <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                  {batch.expand.fee_template.name}
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-400">{batch.source_filename}</p>
          </div>
          {canPost && (
            <button
              type="button"
              disabled={posting}
              onClick={handlePost}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Posting ke Invoice
            </button>
          )}
          {batch.status === "posted" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> Sudah diposting
            </span>
          )}
        </div>
        {canPost && (
          <label className="mb-4 inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sendToPicking}
              onChange={(e) => setSendToPicking(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Lewat gudang (WMS): otomatis Send ke Picking saat posting
          </label>
        )}

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <Stat label="Total baris" value={String(batch.total_rows)} />
          <Stat label="Valid" value={String(batch.valid_rows)} color="text-emerald-600" />
          <Stat label="Error" value={String(batch.error_rows)} color="text-red-600" />
          <Stat label="Order unik" value={String(orderGroups.length)} />
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {postResult && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{postResult}</div>}

        <div className="space-y-4">
          {orderGroups.map((g) => (
            <div key={g.orderNo} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <span className="font-mono font-semibold text-slate-900">{g.orderNo}</span>
                  <span className="ml-2 text-sm text-slate-500">{fmtDate(g.orderDate)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-500">Jual </span>
                  <span className="font-medium">{fmt(g.gross)}</span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="text-slate-500">Biaya </span>
                  <span className="font-medium text-amber-700">{fmt(g.fees)}</span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="text-slate-500">Net </span>
                  <span className="font-semibold text-emerald-700">{fmt(g.net)}</span>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-4 py-2">SKU</th>
                    <th>Produk</th>
                    <th>Kategori (SERBA)</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Jual</th>
                    <th className="text-right">Biaya</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {g.lines.map((l) => (
                    <tr key={l.id} className={l.validation_status === "error" ? "bg-red-50/50" : ""}>
                      <td className="px-4 py-2 font-mono text-xs">{l.mp_sku}</td>
                      <td>{l.expand?.product?.name ?? l.product_name ?? "—"}</td>
                      <td className="text-slate-600">
                        {l.expand?.product?.expand?.category?.name ?? "—"}
                      </td>
                      <td className="text-right">{l.qty}</td>
                      <td className="text-right">{fmt(l.gross_amount)}</td>
                      <td className="text-right text-amber-700">{fmt(l.total_fees)}</td>
                      <td className="px-4 py-2">
                        {l.validation_status === "valid" && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Valid</span>
                        )}
                        {l.validation_status === "error" && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600" title={l.error_message}>
                            <AlertCircle className="h-3.5 w-3.5" /> {l.error_message?.slice(0, 40) ?? "Error"}
                          </span>
                        )}
                        {l.validation_status === "posted" && l.invoice && (
                          <Link href={`/bisnis/penjualan/${l.invoice}`} className="text-xs text-indigo-600 hover:underline">
                            Invoice →
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${color ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function groupByOrder(lines: SalesImportLine[]) {
  const map = new Map<string, { orderNo: string; orderDate: string; lines: SalesImportLine[]; gross: number; fees: number; net: number }>();
  for (const l of lines) {
    const g = map.get(l.mp_order_no) ?? {
      orderNo: l.mp_order_no,
      orderDate: l.order_date,
      lines: [],
      gross: 0,
      fees: 0,
      net: 0,
    };
    g.lines.push(l);
    g.gross += l.gross_amount;
    g.fees += l.total_fees;
    g.net += l.expected_net;
    map.set(l.mp_order_no, g);
  }
  return [...map.values()];
}
