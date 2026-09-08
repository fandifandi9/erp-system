"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  RotateCcw,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertCircle,
} from "lucide-react";
import { fetchReturs } from "@/lib/bisnis/client";
import type { Retur, ReturType } from "@/lib/bisnis/types";
import { ReturModuleTabs } from "@/components/bisnis/ReturModuleTabs";
import { RETUR_MODULE, returCreateUrl } from "@/lib/bisnis/module-routes";
import { returProcessDisplay } from "@/lib/bisnis/retur-workflow";
import { returDisplayNo, returHasPlatformNo } from "@/lib/bisnis/retur-display";
import { useLocale } from "@/components/LocaleProvider";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);

function formatCreatedAt(iso?: string | null, isEn = false) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(isEn ? "en-GB" : "id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  type: ReturType;
};

export function ReturListView({ type }: Props) {
  const { locale } = useLocale();
  const isEn = locale === "en";
  const [data, setData] = useState<Retur[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: string[] = [`type = "${type}"`];
      if (search.trim()) {
        const q = search.trim().replace(/"/g, '\\"');
        filters.push(
          `(retur_no ~ "${q}" || platform_retur_no ~ "${q}" || return_tracking_no ~ "${q}" || return_courier ~ "${q}")`,
        );
      }
      const result = await fetchReturs({
        page,
        perPage,
        filter: filters.join(" && "),
        expand: "customer,supplier,warehouse,created_by",
      });
      setData(result.items);
      setTotalItems(result.totalItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, type]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search, type]);

  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const title =
    type === "penjualan"
      ? isEn
        ? "Sales returns"
        : "Retur penjualan"
      : isEn
        ? "Purchase returns"
        : "Retur pembelian";
  const createHref = returCreateUrl({ type });
  const detailBase = type === "pembelian" ? RETUR_MODULE.pembelian : RETUR_MODULE.penjualan;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            {isEn ? "Returns" : "Retur"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isEn
              ? "Standalone returns module — from sales/purchase documents or without a document."
              : "Modul retur mandiri — dari dokumen jual/beli atau tanpa dokumen."}
          </p>
        </div>
        <Link
          href={createHref}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
        >
          <Plus className="h-4 w-4" />
          {isEn ? "Create return" : "Buat retur"}
        </Link>
      </div>

      <ReturModuleTabs />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isEn
                ? "Search return / platform / tracking…"
                : "Cari no retur / platform / pelacak…"
            }
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : data.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            <RotateCcw className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            {isEn ? "No returns yet." : "Belum ada retur."}
            <div className="mt-3">
              <Link href={createHref} className="font-semibold text-amber-700 hover:underline">
                {isEn ? "Create first return" : "Buat retur pertama"}
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">
                    {type === "penjualan"
                      ? isEn
                        ? "Customer"
                        : "Pelanggan"
                      : isEn
                        ? "Supplier"
                        : "Pemasok"}
                  </th>
                  <th className="px-4 py-3">{isEn ? "Txn date" : "Tgl transaksi"}</th>
                  <th className="px-4 py-3">{isEn ? "Status" : "Status"}</th>
                  <th className="px-4 py-3">{isEn ? "Tracking" : "No. pelacak"}</th>
                  <th className="px-4 py-3 text-right">{isEn ? "Total" : "Total"}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const st = returProcessDisplay(r);
                  const party =
                    type === "penjualan"
                      ? r.expand?.customer?.name ?? "—"
                      : r.expand?.supplier?.name ?? "—";
                  const tracking = r.return_tracking_no?.trim() || "";
                  const courier = r.return_courier?.trim() || "";
                  const href = `${detailBase}/${r.id}`;
                  return (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <Link
                          href={href}
                          className="font-mono font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                          title={isEn ? "Open detail" : "Buka detail"}
                        >
                          {returDisplayNo(r)}
                        </Link>
                        {returHasPlatformNo(r) ? (
                          <p className="font-mono text-[11px] text-slate-400">{r.retur_no}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{party}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {formatCreatedAt(r.created, isEn)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}
                        >
                          {isEn ? st.labelEn : st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {tracking ? (
                          <>
                            <p className="font-mono text-sm font-medium text-slate-800">
                              {tracking}
                            </p>
                            {courier ? (
                              <p className="text-xs text-slate-500">{courier}</p>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">
                        {formatCurrency(Number(r.total) || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalItems > perPage ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>
              {totalItems} {isEn ? "items" : "data"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
