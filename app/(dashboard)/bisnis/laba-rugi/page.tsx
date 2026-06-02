"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, Loader2, AlertCircle, TrendingUp, TrendingDown, DollarSign, Calendar, ChevronDown } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

type PeriodType = "bulan_ini" | "bulan_lalu" | "3_bulan" | "6_bulan" | "tahun_ini" | "custom";

function getDateRange(period: PeriodType, customFrom?: string, customTo?: string) {
  const now = new Date();
  let from: Date;
  let to: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  switch (period) {
    case "bulan_ini":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "bulan_lalu":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case "3_bulan":
      from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case "6_bulan":
      from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
    case "tahun_ini":
      from = new Date(now.getFullYear(), 0, 1);
      break;
    case "custom":
      from = customFrom ? new Date(customFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
      to = customTo ? new Date(customTo + "T23:59:59") : to;
      break;
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label: period === "custom"
      ? `${from.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} - ${to.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`
      : period === "bulan_ini"
        ? now.toLocaleDateString("id-ID", { month: "long", year: "numeric" })
        : period === "bulan_lalu"
          ? new Date(now.getFullYear(), now.getMonth() - 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
          : period === "tahun_ini"
            ? `Tahun ${now.getFullYear()}`
            : `${period.replace("_", " ")} terakhir`,
  };
}

type ExpenseByCategory = { category: string; total: number };

type PLData = {
  pendapatan: {
    penjualan: number;
    penjualanCount: number;
  };
  hpp: {
    pembelian: number;
    pembelianCount: number;
  };
  labaKotor: number;
  biayaOperasional: {
    total: number;
    count: number;
    byCategory: ExpenseByCategory[];
  };
  labaBersih: number;
  margin: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  operasional: "Biaya Operasional",
  gaji: "Gaji & Upah",
  sewa: "Sewa",
  utilitas: "Utilitas",
  transportasi: "Transportasi",
  marketing: "Marketing & Promosi",
  perlengkapan: "Perlengkapan & ATK",
  penyusutan: "Penyusutan Aset",
  pajak: "Pajak",
  asuransi: "Asuransi",
  lainnya: "Biaya Lainnya",
};

export default function LabaRugiPage() {
  const [period, setPeriod] = useState<PeriodType>("bulan_ini");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plData, setPlData] = useState<PLData | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = getDateRange(period, customFrom, customTo);
      const dateFilter = `created >= "${range.from} 00:00:00" && created <= "${range.to} 23:59:59"`;

      const [salesResult, purchaseResult, expenseResult] = await Promise.all([
        pb.collection(BISNIS_COLLECTIONS.salesOrders).getList(1, 1, {
          filter: dateFilter,
          requestKey: null,
        }).catch(() => null),
        pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getList(1, 1, {
          filter: dateFilter,
          requestKey: null,
        }).catch(() => null),
        pb.collection(BISNIS_COLLECTIONS.expenses).getList(1, 1, {
          filter: dateFilter,
          requestKey: null,
        }).catch(() => null),
      ]);

      const salesFilter = `${dateFilter} && status != "cancelled"`;

      const [allSales, allPurchases, allExpenses] = await Promise.all([
        salesResult && salesResult.totalItems > 0
          ? pb.collection(BISNIS_COLLECTIONS.salesOrders).getFullList({
              filter: salesFilter,
              requestKey: null,
            })
          : Promise.resolve([]),
        purchaseResult && purchaseResult.totalItems > 0
          ? pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getFullList({
              filter: dateFilter,
              requestKey: null,
            })
          : Promise.resolve([]),
        expenseResult && expenseResult.totalItems > 0
          ? pb.collection(BISNIS_COLLECTIONS.expenses).getFullList({
              filter: dateFilter,
              requestKey: null,
            })
          : Promise.resolve([]),
      ]);

      const totalPenjualan = allSales.reduce((s, o) => s + ((o as Record<string, number>).total ?? 0), 0);
      const totalPembelian = allPurchases.reduce((s, o) => s + ((o as Record<string, number>).total ?? 0), 0);

      const expByCat = new Map<string, number>();
      let totalBiaya = 0;
      allExpenses.forEach((e) => {
        const rec = e as Record<string, unknown>;
        const cat = (rec.category as string) ?? "lainnya";
        const amt = (rec.total as number) ?? 0;
        totalBiaya += amt;
        expByCat.set(cat, (expByCat.get(cat) ?? 0) + amt);
      });

      const byCategory: ExpenseByCategory[] = [];
      expByCat.forEach((total, category) => {
        byCategory.push({ category, total });
      });
      byCategory.sort((a, b) => b.total - a.total);

      const labaKotor = totalPenjualan - totalPembelian;
      const labaBersih = labaKotor - totalBiaya;
      const margin = totalPenjualan > 0 ? (labaBersih / totalPenjualan) * 100 : 0;

      setPlData({
        pendapatan: { penjualan: totalPenjualan, penjualanCount: allSales.length },
        hpp: { pembelian: totalPembelian, pembelianCount: allPurchases.length },
        labaKotor,
        biayaOperasional: { total: totalBiaya, count: allExpenses.length, byCategory },
        labaBersih,
        margin,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat laporan");
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const range = getDateRange(period, customFrom, customTo);

  return (
    <div className="min-h-screen space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Laporan Laba Rugi</h1>
            <p className="text-sm text-slate-500">Profit & Loss Statement — {range.label}</p>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Periode</label>
          <div className="relative">
            <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodType)}
              className="appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">
              <option value="bulan_ini">Bulan Ini</option>
              <option value="bulan_lalu">Bulan Lalu</option>
              <option value="3_bulan">3 Bulan Terakhir</option>
              <option value="6_bulan">6 Bulan Terakhir</option>
              <option value="tahun_ini">Tahun Ini</option>
              <option value="custom">Custom</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
        {period === "custom" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Dari</label>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Sampai</label>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </div>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          <span className="ml-2 text-sm text-slate-500">Menghitung laporan…</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-600">{error}</p>
          <button type="button" onClick={loadReport} className="mt-1 text-sm font-medium text-emerald-600 hover:text-emerald-700">Coba lagi</button>
        </div>
      ) : plData && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Pendapatan" value={fmt(plData.pendapatan.penjualan)} sub={`${plData.pendapatan.penjualanCount} transaksi`} icon={TrendingUp} color="emerald" />
            <SummaryCard label="HPP (Pembelian)" value={fmt(plData.hpp.pembelian)} sub={`${plData.hpp.pembelianCount} transaksi`} icon={TrendingDown} color="blue" />
            <SummaryCard label="Total Biaya" value={fmt(plData.biayaOperasional.total)} sub={`${plData.biayaOperasional.count} pencatatan`} icon={DollarSign} color="red" />
            <SummaryCard
              label="Laba Bersih"
              value={fmt(plData.labaBersih)}
              sub={`Margin ${fmtPct(plData.margin)}`}
              icon={Calendar}
              color={plData.labaBersih >= 0 ? "emerald" : "red"}
              highlight
            />
          </div>

          {/* P&L Statement */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Laporan Laba Rugi</h2>
              <p className="text-sm text-slate-500">{range.label}</p>
            </div>

            <div className="divide-y divide-slate-100">
              {/* Pendapatan */}
              <div className="px-6 py-4">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-emerald-700">Pendapatan</h3>
                <div className="space-y-2">
                  <PLRow label="Penjualan" value={plData.pendapatan.penjualan} count={plData.pendapatan.penjualanCount} color="emerald" />
                </div>
                <PLTotalRow label="Total Pendapatan" value={plData.pendapatan.penjualan} color="emerald" />
              </div>

              {/* HPP */}
              <div className="px-6 py-4">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-blue-700">Harga Pokok Penjualan (HPP)</h3>
                <div className="space-y-2">
                  <PLRow label="Pembelian Barang" value={plData.hpp.pembelian} count={plData.hpp.pembelianCount} color="blue" />
                </div>
                <PLTotalRow label="Total HPP" value={plData.hpp.pembelian} color="blue" />
              </div>

              {/* Laba Kotor */}
              <div className="bg-slate-50 px-6 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">LABA KOTOR</span>
                  <span className={`text-lg font-bold ${plData.labaKotor >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {fmt(plData.labaKotor)}
                  </span>
                </div>
                {plData.pendapatan.penjualan > 0 && (
                  <p className="mt-0.5 text-right text-xs text-slate-500">
                    Margin kotor: {((plData.labaKotor / plData.pendapatan.penjualan) * 100).toFixed(1)}%
                  </p>
                )}
              </div>

              {/* Biaya Operasional */}
              <div className="px-6 py-4">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-red-700">Biaya Operasional</h3>
                {plData.biayaOperasional.byCategory.length === 0 ? (
                  <p className="text-sm italic text-slate-400">Belum ada pencatatan biaya di periode ini</p>
                ) : (
                  <div className="space-y-2">
                    {plData.biayaOperasional.byCategory.map((c) => (
                      <PLRow key={c.category} label={CATEGORY_LABELS[c.category] ?? c.category} value={c.total} color="red" />
                    ))}
                  </div>
                )}
                <PLTotalRow label="Total Biaya Operasional" value={plData.biayaOperasional.total} color="red" />
              </div>

              {/* Laba Bersih */}
              <div className={`px-6 py-5 ${plData.labaBersih >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-bold text-slate-900">LABA / (RUGI) BERSIH</span>
                    {plData.pendapatan.penjualan > 0 && (
                      <p className="mt-0.5 text-xs text-slate-600">
                        Net Margin: {fmtPct(plData.margin)}
                      </p>
                    )}
                  </div>
                  <span className={`text-2xl font-bold ${plData.labaBersih >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {fmt(plData.labaBersih)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown Biaya */}
          {plData.biayaOperasional.byCategory.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-base font-bold text-slate-900">Komposisi Biaya Operasional</h2>
              </div>
              <div className="px-6 py-4">
                <div className="space-y-3">
                  {plData.biayaOperasional.byCategory.map((c) => {
                    const pct = plData.biayaOperasional.total > 0 ? (c.total / plData.biayaOperasional.total) * 100 : 0;
                    return (
                      <div key={c.category}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-700">{CATEGORY_LABELS[c.category] ?? c.category}</span>
                          <span className="font-semibold text-slate-900">{fmt(c.total)} <span className="text-xs text-slate-400">({pct.toFixed(1)}%)</span></span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-red-400 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PLRow({ label, value, count, color }: { label: string; value: number; count?: number; color: "emerald" | "blue" | "red" }) {
  const textColor = { emerald: "text-emerald-700", blue: "text-blue-700", red: "text-red-700" }[color];
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-700">{label}</span>
        {count !== undefined && <span className="text-xs text-slate-400">({count}x)</span>}
      </div>
      <span className={`text-sm font-semibold ${textColor}`}>{fmt(value)}</span>
    </div>
  );
}

function PLTotalRow({ label, value, color }: { label: string; value: number; color: "emerald" | "blue" | "red" }) {
  const textColor = { emerald: "text-emerald-800", blue: "text-blue-800", red: "text-red-800" }[color];
  const borderColor = { emerald: "border-emerald-200", blue: "border-blue-200", red: "border-red-200" }[color];
  return (
    <div className={`mt-3 flex items-center justify-between border-t pt-2 ${borderColor}`}>
      <span className={`text-sm font-bold ${textColor}`}>{label}</span>
      <span className={`text-base font-bold ${textColor}`}>{fmt(value)}</span>
    </div>
  );
}

function SummaryCard({
  label, value, sub, icon: Icon, color, highlight,
}: {
  label: string; value: string; sub: string;
  icon: React.ComponentType<{ className?: string }>;
  color: "emerald" | "blue" | "red";
  highlight?: boolean;
}) {
  const bg: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <div className={`rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${highlight ? (color === "emerald" ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30") : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className={`mt-1.5 truncate text-xl font-bold tracking-tight ${highlight ? (color === "emerald" ? "text-emerald-700" : "text-red-700") : "text-slate-900"}`}>{value}</p>
          <p className="mt-1 text-xs text-slate-400">{sub}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
