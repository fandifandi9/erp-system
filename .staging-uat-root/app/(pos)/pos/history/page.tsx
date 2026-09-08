"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, Printer, Loader2, Receipt, Package } from "lucide-react";
import { loadPosSession } from "@/lib/pos/session";
import type { PosReceiptData } from "@/lib/pos/receipt";
import { PosShell, PosCard } from "@/components/pos/PosShell";
import { PosReprintModal } from "@/components/pos/PosReprintModal";
import { posModeLabel } from "@/lib/pos/meta";
import type { PosTransactionRow } from "@/app/api/pos/transactions/route";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDt = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function PosHistoryPage() {
  const router = useRouter();
  const [session, setSession] = useState(loadPosSession());
  const [scope, setScope] = useState<"register" | "store">("register");
  const [items, setItems] = useState<PosTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PosReceiptData | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);

  useEffect(() => {
    const s = loadPosSession();
    if (!s) {
      router.replace("/pos/setup");
      return;
    }
    setSession(s);
  }, [router]);

  const loadTransactions = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({
        scope,
        perPage: "40",
      });
      if (scope === "store") q.set("store", session.storeId);
      else q.set("register", session.registerId);
      const res = await fetch(`/api/pos/transactions?${q}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat");
      setItems(data.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat transaksi");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [session, scope]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const openReceipt = async (row: PosTransactionRow, print = false) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewData(null);
    setAutoPrint(print);
    try {
      const q = new URLSearchParams({ so: row.id });
      if (row.invoiceId) q.set("inv", row.invoiceId);
      const res = await fetch(`/api/pos/receipt?${q}`, { credentials: "include" });
      const data = (await res.json()) as PosReceiptData & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat struk");
      setPreviewData(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat struk");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (!session) return null;

  return (
    <PosShell
      title="Riwayat transaksi"
      subtitle={`${session.registerName} · ${session.storeName}`}
    >
      <Link
        href="/pos/sale"
        className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali ke kasir
      </Link>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setScope("register")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            scope === "register"
              ? "bg-indigo-600 text-white"
              : "border border-slate-200 bg-white text-slate-700"
          }`}
        >
          Terminal ini
        </button>
        <button
          type="button"
          onClick={() => setScope("store")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            scope === "store"
              ? "bg-indigo-600 text-white"
              : "border border-slate-200 bg-white text-slate-700"
          }`}
        >
          Semua terminal toko
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <PosCard>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Belum ada transaksi POS.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900">{row.orderNo}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        row.mode === "wms"
                          ? "bg-violet-100 text-violet-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {posModeLabel(row.mode)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{fmtDt(row.created)}</p>
                  {(row.buyerName || row.courier) && (
                    <p className="mt-1 text-xs text-slate-600">
                      {row.buyerName && <span>{row.buyerName}</span>}
                      {row.buyerName && row.courier && " · "}
                      {row.courier && (
                        <span>
                          {row.courier}
                          {row.shippingService ? ` / ${row.shippingService}` : ""}
                        </span>
                      )}
                    </p>
                  )}
                  {row.pickupNo && row.mode === "wms" && (
                    <p className="mt-0.5 font-mono text-xs text-violet-700">Pickup: {row.pickupNo}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{fmt(row.total)}</p>
                  <div className="mt-2 flex gap-1">
                    <button
                      type="button"
                      title="Preview"
                      onClick={() => void openReceipt(row, false)}
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Cetak ulang"
                      onClick={() => void openReceipt(row, true)}
                      className="rounded-lg border border-slate-200 p-2 text-indigo-600 hover:bg-indigo-50"
                    >
                      {row.mode === "wms" ? (
                        <Package className="h-4 w-4" />
                      ) : (
                        <Printer className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PosCard>

      <p className="mt-4 text-center text-xs text-slate-500">
        <Receipt className="mr-1 inline h-3.5 w-3.5" />
        Transaksi POS hanya bisa dilihat & dicetak ulang di sini. Edit/hapus lewat Penjualan di ERP.
      </p>

      <PosReprintModal
        open={previewOpen}
        loading={previewLoading}
        data={previewData}
        autoPrint={autoPrint}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewData(null);
          setAutoPrint(false);
        }}
      />
    </PosShell>
  );
}
