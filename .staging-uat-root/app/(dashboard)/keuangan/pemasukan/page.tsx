"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, TrendingUp } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { Payment } from "@/lib/bisnis/client";
import { KeuanganSubpageShell } from "@/components/keuangan/KeuanganSubpageShell";
import { buildReportFilter, reportDimensionSummary } from "@/lib/bisnis/report-filters";
import { useReportDimensions } from "@/lib/bisnis/use-report-dimensions";
import { ReportDimensionFilters } from "@/components/bisnis/ReportDimensionFilters";

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export default function PemasukanPage() {
  const {
    companyId,
    companyName,
    stores,
    channels,
    cashAccounts,
    storeId,
    setStoreId,
    channelId,
    setChannelId,
    cashAccountId,
    setCashAccountId,
    dimensions,
  } = useReportDimensions();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

      const filter = buildReportFilter(`payment_date >= "${monthStart}"`, {
        companyId,
        storeId,
        channelId,
        cashAccountId,
        storeField: "invoice.store",
        channelField: "invoice.platform_source",
      });

      const rows = await pb.collection(BISNIS_COLLECTIONS.payments).getFullList<Payment>({
        filter,
        sort: "-payment_date",
        expand: "payment_method,invoice",
        requestKey: null,
      });
      const income = rows.filter((p) => p.payment_kind !== "refund");
      setPayments(income);
      setTotal(income.reduce((s, p) => s + (p.amount ?? 0), 0));
    } catch (err) {
      console.error("Pemasukan load error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, storeId, channelId, cashAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const dimSummary = reportDimensionSummary(dimensions, { stores, channels, cashAccounts });

  return (
    <KeuanganSubpageShell
      title="Pemasukan"
      description={
        dimSummary
          ? `Penerimaan pembayaran invoice bulan ini · ${dimSummary}`
          : "Penerimaan pembayaran invoice bulan ini"
      }
      action={
        <Link href="/bisnis/invoice" className="text-sm font-medium text-indigo-600 hover:underline">
          Kelola invoice →
        </Link>
      }
    >
      <ReportDimensionFilters
        companyName={companyName}
        stores={stores}
        channels={channels}
        cashAccounts={cashAccounts}
        storeId={storeId}
        onStoreChange={setStoreId}
        channelId={channelId}
        onChannelChange={setChannelId}
        cashAccountId={cashAccountId}
        onCashAccountChange={setCashAccountId}
        showStore
        showChannel
        showCashAccount
      />

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-medium text-emerald-700">Total pemasukan bulan ini</p>
        <p className="text-2xl font-bold text-emerald-900">{currency(total)}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          </div>
        ) : payments.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Belum ada penerimaan bulan ini</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {payments.map((p) => {
              const inv = p.expand?.invoice;
              return (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">
                      {inv?.invoice_no ? (
                        <Link href={`/bisnis/invoice`} className="hover:text-indigo-600">
                          {inv.invoice_no}
                        </Link>
                      ) : (
                        "Pembayaran invoice"
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(p.payment_date).toLocaleDateString("id-ID")}
                      {p.expand?.payment_method?.name ? ` · ${p.expand.payment_method.name}` : ""}
                      {p.reference_no ? ` · ${p.reference_no}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-700">+{currency(p.amount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </KeuanganSubpageShell>
  );
}
