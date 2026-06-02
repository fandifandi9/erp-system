"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft, Upload, Loader2, Download, FileSpreadsheet, ChevronRight,
} from "lucide-react";
import {
  fetchSalesImportBatches,
  fetchStoreChannelAccounts,
  fetchMpFeeTemplates,
  createImportBatchFromFile,
} from "@/lib/bisnis/client";
import { downloadMpImportTemplateXlsx } from "@/lib/export/mp-import-template-xlsx";
import { parseSalesImportFile } from "@/lib/bisnis/mp-import-parse";
import type { MpFeeTemplate, SalesImportBatch, StoreChannelAccount } from "@/lib/bisnis/types";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  validated: "Siap posting",
  posted: "Posted",
  cancelled: "Dibatalkan",
};

export default function ImportPenjualanOnlinePage() {
  const [batches, setBatches] = useState<SalesImportBatch[]>([]);
  const [accounts, setAccounts] = useState<StoreChannelAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [feeTemplates, setFeeTemplates] = useState<MpFeeTemplate[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, acc, tpl] = await Promise.all([
        fetchSalesImportBatches({ page: 1, perPage: 50 }),
        fetchStoreChannelAccounts(true),
        fetchMpFeeTemplates({ filter: "is_active = true" }).catch(() => [] as MpFeeTemplate[]),
      ]);
      setBatches(res.items);
      setAccounts(acc);
      setFeeTemplates(tpl);
      if (!accountId && acc[0]) setAccountId(acc[0].id);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal memuat batch import"));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const acc = accounts.find((a) => a.id === accountId);
    if (acc?.default_fee_template) setTemplateId(acc.default_fee_template);
    else if (!templateId && feeTemplates[0]) setTemplateId(feeTemplates[0].id);
  }, [accountId, accounts, feeTemplates, templateId]);

  const downloadTemplate = async () => {
    try {
      await downloadMpImportTemplateXlsx();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal unduh template Excel");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accountId) return;
    setUploading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const rows = parseSalesImportFile(buffer);
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error("Login ulang diperlukan");
      const batch = await createImportBatchFromFile(
        accountId,
        rows,
        userId,
        file.name,
        templateId || undefined,
      );
      if (fileRef.current) fileRef.current.value = "";
      await load();
      window.location.href = `/bisnis/penjualan-online/import/${batch.id}`;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Gagal upload file"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link href="/bisnis/penjualan-online" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Penjualan Online
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Import Penjualan MP</h1>
        <p className="mt-1 text-sm text-slate-500">Upload Excel/CSV transaksi marketplace → review biaya → posting invoice</p>
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-950">
          <p className="font-medium">SKU seragam (kunci kategori & pelunasan)</p>
          <p className="mt-1 text-indigo-900/90">
            Kolom <span className="font-mono text-xs">mp_sku</span> harus sama dengan{" "}
            <strong>Kode produk / SKU</strong> di master produk SERBA (contoh:{" "}
            <span className="font-mono text-xs">22344FGG56666</span>) — dipakai di Shopee, Tokopedia, BliBli, dll.
            Kategori biaya dihitung dari kategori produk di SERBA, bukan label kategori di export MP.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">Upload batch baru</h2>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Akun toko-marketplace</span>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_name} ({a.expand?.channel?.name})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  Template kalkulasi profit{" "}
                  <Link href="/bisnis/kalkulasi-harga-jual" className="font-normal text-indigo-600 underline">
                    kelola
                  </Link>
                </span>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {feeTemplates.length === 0 ? (
                    <option value="">— Buat template dulu —</option>
                  ) : (
                    feeTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))
                  )}
                </select>
                {feeTemplates.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    Belum ada template.{" "}
                    <Link href="/bisnis/kalkulasi-harga-jual" className="underline">
                      Buat Template Kalkulasi
                    </Link>{" "}
                    (mis. Shopee Mall) — tanpa ini import pakai rule biaya lama.
                  </p>
                )}
              </label>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Template Excel
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Memproses…" : "Upload Excel/CSV"}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} disabled={uploading || !accountId} />
            </label>
            </div>
          </div>
          {accounts.length === 0 && (
            <p className="mt-3 text-sm text-amber-700">
              Belum ada akun toko-MP.{" "}
              <Link href="/bisnis/penjualan-online/pengaturan" className="font-semibold underline">
                Atur di Pengaturan
              </Link>
            </p>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-8">
          <h2 className="mb-3 font-semibold text-slate-900">Riwayat batch</h2>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
          ) : batches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-400">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-200" />
              <p className="mt-2">Belum ada batch import</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-4 py-3">Batch</th>
                    <th>Akun</th>
                    <th>Periode</th>
                    <th>Baris</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {batches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-medium">{b.batch_no}</td>
                      <td>{b.expand?.store_channel_account?.account_name ?? "—"}</td>
                      <td className="text-slate-600">{fmtDate(b.period_from)} – {fmtDate(b.period_to)}</td>
                      <td>
                        <span className="text-emerald-600">{b.valid_rows}</span>
                        {b.error_rows > 0 && <span className="text-red-600"> / {b.error_rows} err</span>}
                        <span className="text-slate-400"> / {b.total_rows}</span>
                      </td>
                      <td>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          b.status === "posted" ? "bg-emerald-100 text-emerald-800" :
                          b.status === "validated" ? "bg-blue-100 text-blue-800" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/bisnis/penjualan-online/import/${b.id}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                          Detail <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
