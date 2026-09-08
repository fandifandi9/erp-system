"use client";

import { useEffect, useState, useCallback } from "react";
import { Clipboard, TrendingDown, Building2, Package, Download, Loader2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { PurchaseOrder } from "@/lib/bisnis/types";
import { downloadPurchaseReportXlsx } from "@/lib/export/purchase-report-xlsx";
import { buildReportFilter, reportDimensionSummary } from "@/lib/bisnis/report-filters";
import { useReportDimensions } from "@/lib/bisnis/use-report-dimensions";
import { ReportDimensionFilters } from "@/components/bisnis/ReportDimensionFilters";

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

type MonthData = { month: string; value: number };
type TopItem = { name: string; count: number; total: number };

export default function LaporanPembelianPage() {
  const {
    companyId,
    companyName,
    warehouses,
    warehouseId,
    setWarehouseId,
    dimensions,
  } = useReportDimensions();

  const [loading, setLoading] = useState(true);
  const [totalSpend, setTotalSpend] = useState(0);
  const [totalPOs, setTotalPOs] = useState(0);
  const [supplierCount, setSupplierCount] = useState(0);
  const [receivedCount, setReceivedCount] = useState(0);
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<TopItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];

      const filter = buildReportFilter(`order_date >= "${yearStart}" && status != "cancelled"`, {
        companyId,
        warehouseId,
      });

      const pos = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getFullList<PurchaseOrder>({
        filter,
        expand: "supplier",
        requestKey: null,
      });
      setPurchaseOrders(pos);

      const spend = pos.reduce((s, o) => s + (o.total || 0), 0);
      setTotalSpend(spend);
      setTotalPOs(pos.length);
      setReceivedCount(pos.filter((p) => p.status === "received").length);

      const supSet = new Set(pos.map((p) => p.supplier));
      setSupplierCount(supSet.size);

      const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      const monthMap = new Map<number, number>();
      for (const o of pos) {
        const m = new Date(o.order_date).getMonth();
        monthMap.set(m, (monthMap.get(m) || 0) + (o.total || 0));
      }
      const md: MonthData[] = [];
      for (let i = 0; i <= now.getMonth(); i++) {
        md.push({ month: months[i], value: monthMap.get(i) || 0 });
      }
      setMonthlyData(md);

      const supTotals = new Map<string, { name: string; count: number; total: number }>();
      for (const o of pos) {
        const sname = ((o.expand?.supplier as Record<string, unknown>)?.name as string) || o.supplier;
        const existing = supTotals.get(o.supplier) || { name: sname, count: 0, total: 0 };
        existing.count++;
        existing.total += o.total || 0;
        supTotals.set(o.supplier, existing);
      }
      setTopSuppliers(
        Array.from(supTotals.values())
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
      );
    } catch (err) {
      console.error("Laporan load error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const dimSummary = reportDimensionSummary(dimensions, { warehouses });

  const handleExportExcel = async () => {
    if (purchaseOrders.length === 0) return;
    setExporting(true);
    try {
      await downloadPurchaseReportXlsx(
        purchaseOrders.map((o) => ({
          order_date: o.order_date,
          po_no: o.po_no ?? o.id,
          supplier_name:
            ((o.expand?.supplier as Record<string, unknown>)?.name as string) || o.supplier,
          status: o.status ?? "",
          total: o.total || 0,
        }))
      );
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal export Excel");
    } finally {
      setExporting(false);
    }
  };

  const maxVal = Math.max(...monthlyData.map((d) => d.value), 1);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const stats = [
    { label: "Pembelian Tahun Ini", value: currency(totalSpend), icon: TrendingDown, color: "bg-blue-50 text-blue-600" },
    { label: "Total PO", value: String(totalPOs), icon: Clipboard, color: "bg-slate-100 text-slate-600" },
    { label: "Supplier Aktif", value: String(supplierCount), icon: Building2, color: "bg-green-50 text-green-600" },
    { label: "PO Diterima", value: String(receivedCount), icon: Package, color: "bg-purple-50 text-purple-600" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Laporan Pembelian</h1>
          <p className="mt-1 text-sm text-slate-500">
            Analisis pembelian dan tren supplier
            {dimSummary ? ` · ${dimSummary}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleExportExcel()}
          disabled={exporting || purchaseOrders.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Excel
        </button>
      </div>

      <ReportDimensionFilters
        companyName={companyName}
        warehouses={warehouses}
        warehouseId={warehouseId}
        onWarehouseChange={setWarehouseId}
        showStore={false}
        showWarehouse
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={"flex h-10 w-10 items-center justify-center rounded-xl " + s.color}>
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-lg font-bold text-slate-900 truncate">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {monthlyData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Tren Pembelian Bulanan</h2>
          <div className="flex items-end gap-3 h-48">
            {monthlyData.map((d) => (
              <div key={d.month} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-slate-600">
                  {d.value >= 1_000_000 ? currency(d.value / 1_000_000) + " jt" : currency(d.value)}
                </span>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-blue-400 transition-all min-h-[4px]"
                  style={{ height: `${Math.max((d.value / maxVal) * 100, 2)}%` }}
                />
                <span className="text-xs text-slate-500">{d.month}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Top Supplier</h2>
        </div>
        {topSuppliers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Belum ada data</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {topSuppliers.map((s, i) => (
              <div key={s.name} className="flex items-center gap-4 px-5 py-3.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.count} purchase order</p>
                </div>
                <span className="text-sm font-semibold text-slate-900">{currency(s.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
