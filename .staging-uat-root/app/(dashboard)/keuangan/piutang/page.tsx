"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Receipt } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { Invoice } from "@/lib/bisnis/types";
import { KeuanganSubpageShell } from "@/components/keuangan/KeuanganSubpageShell";
import { buildReportFilter, reportDimensionSummary } from "@/lib/bisnis/report-filters";
import { useReportDimensions } from "@/lib/bisnis/use-report-dimensions";
import { ReportDimensionFilters } from "@/components/bisnis/ReportDimensionFilters";

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export default function PiutangPage() {
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

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filter = buildReportFilter(`status != "paid" && status != "cancelled"`, {
        companyId,
        storeId,
        warehouseId,
        channelId,
        warehouseField: "sales_order.warehouse",
      });

      const rows = await pb.collection(BISNIS_COLLECTIONS.invoices).getFullList<Invoice>({
        filter,
        sort: "-due_date",
        expand: "customer",
        requestKey: null,
      });
      setInvoices(rows);
      setTotal(rows.reduce((s, inv) => s + (inv.remaining ?? 0), 0));
    } catch (err) {
      console.error("Piutang load error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, storeId, warehouseId, channelId]);

  useEffect(() => {
    load();
  }, [load]);

  const dimSummary = reportDimensionSummary(dimensions, { stores, warehouses, channels });

  return (
    <KeuanganSubpageShell
      title="Piutang Pelanggan"
      description={
        dimSummary ? `Invoice yang belum lunas · ${dimSummary}` : "Invoice yang belum lunas"
      }
      action={
        <Link href="/bisnis/invoice" className="text-sm font-medium text-indigo-600 hover:underline">
          Buka modul invoice →
        </Link>
      }
    >
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
        showStore
        showWarehouse
        showChannel
      />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-medium text-amber-700">Total piutang</p>
        <p className="text-2xl font-bold text-amber-900">{currency(total)}</p>
        <p className="mt-1 text-xs text-amber-800">{invoices.length} invoice belum lunas</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Tidak ada piutang terbuka</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                  <Receipt className="h-4 w-4 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{inv.invoice_no}</p>
                  <p className="text-xs text-slate-500">
                    {(inv.expand?.customer as { name?: string } | undefined)?.name ?? "—"}
                    {inv.due_date
                      ? ` · Jatuh tempo ${new Date(inv.due_date).toLocaleDateString("id-ID")}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{currency(inv.remaining ?? 0)}</p>
                  <p className="text-xs text-slate-400">dari {currency(inv.total ?? 0)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </KeuanganSubpageShell>
  );
}
