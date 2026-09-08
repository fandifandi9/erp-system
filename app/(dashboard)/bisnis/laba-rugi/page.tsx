"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, Loader2, AlertCircle, TrendingUp, TrendingDown, DollarSign, Calendar, ChevronDown } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { buildReportFilter, REPORT_ALL, reportDimensionSummary } from "@/lib/bisnis/report-filters";
import { mergeCompanyFilter } from "@/lib/bisnis/entity-resolve";
import { useReportDimensions } from "@/lib/bisnis/use-report-dimensions";
import { ReportDimensionFilters } from "@/components/bisnis/ReportDimensionFilters";
import { fetchLastPurchaseUnitCosts } from "@/lib/bisnis/purchase-cost";
import type { CreditNote, Invoice, SalesOrderLine } from "@/lib/bisnis/types";
import type { Payment } from "@/lib/bisnis/client";

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
    /** Retur Penjualan (nota kredit periode ini) — contra revenue. */
    retur: number;
    returCount: number;
    /** Pendapatan bersih = penjualan − retur. */
    bersih: number;
  };
  pendapatanLain: {
    /** Fee/denda pelunasan yang dicatat saat pembayaran (akrual periode bayar). */
    total: number;
    count: number;
  };
  hpp: {
    total: number;
    qty: number;
    /** Jumlah produk terjual yang belum punya harga modal pembelian. */
    missingCost: number;
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
  marketplace: "Biaya Marketplace",
  perlengkapan: "Perlengkapan & ATK",
  penyusutan: "Penyusutan Aset",
  pajak: "Pajak",
  asuransi: "Asuransi",
  lainnya: "Biaya Lainnya",
};

export default function LabaRugiPage() {
  const {
    companyId,
    companyName,
    stores,
    warehouses,
    channels,
    storeId,
    setStoreId,
    warehouseId,
    setWarehouseId,
    channelId,
    setChannelId,
    dimensions,
  } = useReportDimensions();

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
      const dateFrom = range.from;
      const dateTo = `${range.to} 23:59:59`;

      // Pendapatan = invoice terbit pada periode (bukan SO), konsisten dengan laporan penjualan.
      const invoiceFilter = buildReportFilter(
        `issue_date >= "${dateFrom}" && issue_date <= "${dateTo}" && status != "cancelled"`,
        { companyId, storeId, warehouseId, channelId, warehouseField: "sales_order.warehouse" },
      );
      const expenseFilter = buildReportFilter(
        `expense_date >= "${dateFrom}" && expense_date <= "${dateTo}" && status != "cancelled" && status != "draft"`,
        { companyId, storeId, warehouseId },
      );

      // Retur Penjualan (nota kredit) dicatat di periode terbit nota — bukan periode invoice asli.
      const creditNoteFilter = mergeCompanyFilter(
        `cn_date >= "${dateFrom}" && cn_date <= "${dateTo}" && status = "issued"`,
        companyId,
      );
      // Fee/denda pelunasan = Pendapatan Lain-lain di periode pembayaran.
      const feeFilter = mergeCompanyFilter(
        `payment_date >= "${dateFrom}" && payment_date <= "${dateTo}" && fee_amount > 0`,
        companyId,
      );

      const [invoices, allExpenses, creditNotes, feePayments] = await Promise.all([
        pb
          .collection(BISNIS_COLLECTIONS.invoices)
          .getFullList<Invoice>({ filter: invoiceFilter, requestKey: null })
          .catch(() => [] as Invoice[]),
        pb
          .collection(BISNIS_COLLECTIONS.expenses)
          .getFullList({ filter: expenseFilter, requestKey: null })
          .catch(() => [] as Record<string, unknown>[]),
        pb
          .collection(BISNIS_COLLECTIONS.creditNotes)
          .getFullList<CreditNote>({ filter: creditNoteFilter, expand: "invoice.sales_order", requestKey: null })
          .catch(() => [] as CreditNote[]),
        pb
          .collection(BISNIS_COLLECTIONS.payments)
          .getFullList<Payment & { expand?: { invoice?: Invoice } }>({
            filter: feeFilter,
            expand: "invoice.sales_order",
            requestKey: null,
          })
          .catch(() => [] as (Payment & { expand?: { invoice?: Invoice } })[]),
      ]);

      const totalPenjualan = invoices.reduce((s, inv) => s + (inv.total ?? 0), 0);

      const matchInvoiceDims = (inv?: Invoice) => {
        if (!inv) {
          return (
            storeId === REPORT_ALL && warehouseId === REPORT_ALL && channelId === REPORT_ALL
          );
        }
        if (storeId !== REPORT_ALL && inv.store !== storeId) return false;
        if (channelId !== REPORT_ALL && inv.platform_source !== channelId) return false;
        if (warehouseId !== REPORT_ALL) {
          const invWh = inv.expand?.sales_order?.warehouse;
          if (!invWh || invWh !== warehouseId) return false;
        }
        return true;
      };

      const cnInPeriod = creditNotes.filter((cn) => matchInvoiceDims(cn.expand?.invoice));
      const totalRetur = cnInPeriod.reduce((s, cn) => s + (Number(cn.amount) || 0), 0);
      const pendapatanBersih = totalPenjualan - totalRetur;

      const feeInPeriod = feePayments.filter(
        (p) => p.payment_kind !== "refund" && matchInvoiceDims(p.expand?.invoice),
      );
      const totalPendapatanLain = feeInPeriod.reduce((s, p) => s + (Number(p.fee_amount) || 0), 0);

      // HPP = qty terjual × harga modal (unit_cost pembelian terakhir per produk).
      const soIds = [...new Set(invoices.map((inv) => inv.sales_order).filter(Boolean))] as string[];
      let soLines: SalesOrderLine[] = [];
      for (let i = 0; i < soIds.length; i += 40) {
        const chunk = soIds.slice(i, i + 40);
        const part = await pb
          .collection(BISNIS_COLLECTIONS.salesOrderLines)
          .getFullList<SalesOrderLine>({
            filter: chunk.map((sid) => `sales_order = "${sid}"`).join(" || "),
            requestKey: null,
          })
          .catch(() => [] as SalesOrderLine[]);
        soLines = soLines.concat(part);
      }

      const costs =
        soLines.length > 0
          ? await fetchLastPurchaseUnitCosts().catch(
              () => ({} as Record<string, { unit_cost?: number }>),
            )
          : {};
      let totalHpp = 0;
      let totalQty = 0;
      const missingCostProducts = new Set<string>();
      for (const line of soLines) {
        const qty = Number(line.qty) || 0;
        totalQty += qty;
        const cost = costs[line.product]?.unit_cost ?? 0;
        if (cost > 0) totalHpp += qty * cost;
        else if (line.product) missingCostProducts.add(line.product);
      }

      const expByCat = new Map<string, number>();
      let totalBiaya = 0;
      allExpenses.forEach((e) => {
        const rec = e as Record<string, unknown>;
        const cat = (rec.category as string) ?? "lainnya";
        const amt = (rec.total as number) ?? (rec.amount as number) ?? 0;
        totalBiaya += amt;
        expByCat.set(cat, (expByCat.get(cat) ?? 0) + amt);
      });

      const byCategory: ExpenseByCategory[] = [];
      expByCat.forEach((total, category) => {
        byCategory.push({ category, total });
      });
      byCategory.sort((a, b) => b.total - a.total);

      const labaKotor = pendapatanBersih - totalHpp;
      const labaBersih = labaKotor + totalPendapatanLain - totalBiaya;
      const margin = pendapatanBersih > 0 ? (labaBersih / pendapatanBersih) * 100 : 0;

      setPlData({
        pendapatan: {
          penjualan: totalPenjualan,
          penjualanCount: invoices.length,
          retur: totalRetur,
          returCount: cnInPeriod.length,
          bersih: pendapatanBersih,
        },
        pendapatanLain: { total: totalPendapatanLain, count: feeInPeriod.length },
        hpp: { total: totalHpp, qty: totalQty, missingCost: missingCostProducts.size },
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
  }, [period, customFrom, customTo, storeId, warehouseId, channelId, companyId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const range = getDateRange(period, customFrom, customTo);
  const dimSummary = reportDimensionSummary(dimensions, { stores, warehouses, channels });

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
            <p className="text-sm text-slate-500">
              Ringkasan laba rugi — {range.label}
              {dimSummary ? ` · ${dimSummary}` : stores.length > 1 ? " · Semua toko" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap items-end gap-3">
        <ReportDimensionFilters
          companyName={companyName}
          stores={stores}
          warehouses={warehouses}
          channels={channels}
          storeId={storeId}
          onStoreChange={setStoreId}
          warehouseId={warehouseId}
          onWarehouseChange={setWarehouseId}
          channelId={channelId}
          onChannelChange={setChannelId}
          showStore={stores.length > 0}
          showWarehouse
          showChannel
        />
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
              <option value="custom">Kustom</option>
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
            <SummaryCard label="Pendapatan Bersih" value={fmt(plData.pendapatan.bersih)} sub={`${plData.pendapatan.penjualanCount} faktur${plData.pendapatan.retur > 0 ? ` − retur ${fmt(plData.pendapatan.retur)}` : ""}`} icon={TrendingUp} color="emerald" />
            <SummaryCard label="HPP (barang terjual)" value={fmt(plData.hpp.total)} sub={`${plData.hpp.qty} pcs terjual`} icon={TrendingDown} color="blue" />
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
                  <PLRow label="Penjualan (faktur terbit)" value={plData.pendapatan.penjualan} count={plData.pendapatan.penjualanCount} color="emerald" />
                  {plData.pendapatan.retur > 0 && (
                    <PLRow label="Retur Penjualan (nota kredit)" value={-plData.pendapatan.retur} count={plData.pendapatan.returCount} color="red" />
                  )}
                </div>
                <PLTotalRow label="Total Pendapatan Bersih" value={plData.pendapatan.bersih} color="emerald" />
              </div>

              {/* HPP */}
              <div className="px-6 py-4">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-blue-700">Harga Pokok Penjualan (HPP)</h3>
                <div className="space-y-2">
                  <PLRow label={`Barang terjual × harga modal (${plData.hpp.qty} pcs)`} value={plData.hpp.total} color="blue" />
                </div>
                {plData.hpp.missingCost > 0 && (
                  <p className="mt-2 text-xs text-amber-600">
                    {plData.hpp.missingCost} produk terjual belum punya riwayat harga beli — HPP-nya dihitung 0.
                  </p>
                )}
                <PLTotalRow label="Total HPP" value={plData.hpp.total} color="blue" />
              </div>

              {/* Laba Kotor */}
              <div className="bg-slate-50 px-6 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">LABA KOTOR</span>
                  <span className={`text-lg font-bold ${plData.labaKotor >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {fmt(plData.labaKotor)}
                  </span>
                </div>
                {plData.pendapatan.bersih > 0 && (
                  <p className="mt-0.5 text-right text-xs text-slate-500">
                    Margin kotor: {((plData.labaKotor / plData.pendapatan.bersih) * 100).toFixed(1)}%
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

              {/* Pendapatan Lain-lain */}
              {plData.pendapatanLain.total > 0 && (
                <div className="px-6 py-4">
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-emerald-700">Pendapatan Lain-lain</h3>
                  <div className="space-y-2">
                    <PLRow label="Biaya / denda pelunasan" value={plData.pendapatanLain.total} count={plData.pendapatanLain.count} color="emerald" />
                  </div>
                  <PLTotalRow label="Total Pendapatan Lain-lain" value={plData.pendapatanLain.total} color="emerald" />
                </div>
              )}

              {/* Laba Bersih */}
              <div className={`px-6 py-5 ${plData.labaBersih >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-bold text-slate-900">LABA / (RUGI) BERSIH</span>
                    {plData.pendapatan.bersih > 0 && (
                      <p className="mt-0.5 text-xs text-slate-600">
                        Margin bersih: {fmtPct(plData.margin)}
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
