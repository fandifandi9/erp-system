"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Upload,
  Loader2,
  Download,
  History,
  ShoppingBag,
  Banknote,
} from "lucide-react";
import {
  fetchStores,
  fetchMpFeeTemplates,
  createImportBatchFromFile,
  createPaymentImportBatchFromFile,
  type ImportActivityKind,
} from "@/lib/bisnis/client";
import { tierBundleLabel } from "@/lib/bisnis/mp-template-client";
import { downloadMpImportTemplateXlsx } from "@/lib/export/mp-import-template-xlsx";
import { downloadPaymentImportTemplateXlsx } from "@/lib/export/payment-import-template-xlsx";
import { parseSalesImportFile } from "@/lib/bisnis/mp-import-parse";
import { parsePaymentImportFile } from "@/lib/bisnis/payment-import-parse";
import type { MpFeeTemplate } from "@/lib/bisnis/types";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import { useWorkContext } from "@/components/WorkContextProvider";

const NO_MP_FEES = "";

function templateOptionLabel(t: MpFeeTemplate): string {
  const platform = t.expand?.channel?.name ?? "?";
  const tier = t.expand?.seller_tier?.label ?? "?";
  return t.name || tierBundleLabel(platform, tier);
}

function ImportMassalContent() {
  const { context: workContext } = useWorkContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const jenis = (searchParams.get("jenis") === "pelunasan" ? "pelunasan" : "penjualan") as ImportActivityKind;

  const setJenis = (k: ImportActivityKind) => {
    router.replace(`/bisnis/penjualan/import?jenis=${k}`);
  };

  const [stores, setStores] = useState<{ id: string; name: string; default_warehouse?: string }[]>([]);
  const [feeTemplates, setFeeTemplates] = useState<MpFeeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState("");
  const [feeTemplateId, setFeeTemplateId] = useState(NO_MP_FEES);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedStore = stores.find((s) => s.id === storeId);
  const feeOptions = feeTemplates.filter((t) => t.channel && t.seller_tier);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [st, tpl] = await Promise.all([
        fetchStores(false),
        fetchMpFeeTemplates({ filter: "is_active = true" }).catch(() => [] as MpFeeTemplate[]),
      ]);
      setStores(
        st.map((s) => ({
          id: s.id,
          name: s.name,
          default_warehouse: s.default_warehouse,
        })),
      );
      setFeeTemplates(tpl);
      if (st.length === 1) {
        setStoreId(st[0].id);
      } else if (workContext?.storeId) {
        setStoreId((cur) => cur || workContext.storeId!);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal memuat data toko & rumus"));
    } finally {
      setLoading(false);
    }
  }, [workContext?.storeId]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadTemplate = async () => {
    if (jenis === "pelunasan") {
      await downloadPaymentImportTemplateXlsx();
      return;
    }
    if (!selectedStore) {
      alert("Pilih toko dulu.");
      return;
    }
    await downloadMpImportTemplateXlsx({ storeName: selectedStore.name });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (jenis === "penjualan" && !storeId) {
      alert("Pilih toko dulu.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error("Login ulang diperlukan");

      if (jenis === "pelunasan") {
        const rows = parsePaymentImportFile(buffer);
        const batch = await createPaymentImportBatchFromFile(rows, userId, file.name);
        router.push(`/bisnis/penjualan/pelunasan-import/${batch.id}`);
      } else {
        const rows = parseSalesImportFile(buffer);
        const batch = await createImportBatchFromFile(
          storeId,
          rows,
          userId,
          file.name,
          feeTemplateId || undefined,
        );
        router.push(`/bisnis/penjualan/import/${batch.id}`);
      }
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Gagal upload file"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          href="/bisnis/penjualan"
          className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Penjualan
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Import massal</h1>
            <p className="mt-1 text-sm text-slate-600">
              Upload Excel penjualan marketplace atau pelunasan. Rumus potongan di{" "}
              <Link href="/bisnis/marketplace" className="font-medium text-indigo-600 hover:underline">
                Master Marketplace
              </Link>
              .
            </p>
          </div>
          <Link
            href="/bisnis/penjualan/riwayat-import"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <History className="h-4 w-4" /> Riwayat pemrosesan
          </Link>
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-950">
          <p className="font-medium">Status impor</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-blue-900/90">
            <li>
              <strong>Selesai</strong> — semua baris/order valid berhasil diposting (
              <span className="font-mono text-xs">N dari N</span>).
            </li>
            <li>
              <strong>Sebagian</strong> — sebagian berhasil; periksa detail batch dan koreksi manual
              jika perlu.
            </li>
            <li>
              <strong>Gagal</strong> — tidak ada yang terposting; batch bisa dibatalkan dan di-upload
              ulang.
            </li>
          </ul>
        </div>

        <div className="mt-6 flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setJenis("penjualan")}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              jenis === "penjualan"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            Penjualan
          </button>
          <button
            type="button"
            onClick={() => setJenis("pelunasan")}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              jenis === "pelunasan"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Banknote className="h-4 w-4" />
            Pelunasan
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {jenis === "penjualan" && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  Rumus potongan MP{" "}
                  <Link
                    href="/bisnis/marketplace"
                    className="font-normal text-indigo-600 underline"
                  >
                    kelola
                  </Link>
                </span>
                <select
                  value={feeTemplateId}
                  onChange={(e) => setFeeTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value={NO_MP_FEES}>— Tanpa potongan MP —</option>
                  {feeOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {templateOptionLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              {stores.length > 1 ? (
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Toko (*)</span>
                  <select
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Pilih toko</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          )}

          {jenis === "penjualan" && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
              <p className="font-medium">Contoh Excel siap pakai</p>
              <p className="mt-1 text-emerald-900/90">
                File berisi <strong>2 pesanan contoh</strong> (3 baris produk) dengan{" "}
                <strong>semua kolom invoice terisi</strong> — pelanggan, tanggal, PPN, diskon,
                materai, ongkir, ekspedisi, resi, alamat kirim, dan detail barang.
              </p>
              <p className="mt-2 text-emerald-900/90">
                Sebelum upload: pastikan kontak <span className="font-mono text-xs">defan</span> &amp;{" "}
                <span className="font-mono text-xs">ajas</span> ada di menu Kontak, SKU{" "}
                <span className="font-mono text-xs">22344FGG56666</span> ada di Katalog, lalu pilih
                toko <strong>COSTA</strong> saat upload.
              </p>
              <a
                href="/samples/contoh-import-penjualan-COSTA.xlsx"
                download="contoh-import-penjualan-COSTA.xlsx"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
              >
                <Download className="h-4 w-4" />
                Unduh contoh Excel COSTA
              </a>
            </div>
          )}

          {jenis === "pelunasan" && (
            <p className="mb-4 text-sm text-slate-600">
              Kolom wajib: <span className="font-mono text-xs">no_invoice, tgl_pembayaran, jumlah, metode_bayar</span>.
              Metode bayar harus ada di master Pengaturan.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => downloadTemplate().catch((e) => alert(String(e)))}
              disabled={jenis === "penjualan" && !storeId}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {jenis === "penjualan"
                ? "Unduh contoh Excel (nama toko dipilih)"
                : "Unduh template pelunasan"}
            </button>
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                jenis === "pelunasan" || storeId
                  ? "bg-indigo-600 hover:bg-indigo-700"
                  : "cursor-not-allowed bg-slate-300"
              }`}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Memproses…" : "Upload Excel"}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={uploading || (jenis === "penjualan" && !storeId)}
                onChange={handleUpload}
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

      </div>
    </div>
  );
}

export default function ImportMassalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <ImportMassalContent />
    </Suspense>
  );
}
