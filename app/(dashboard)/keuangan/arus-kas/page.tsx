"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { Expense } from "@/lib/bisnis/types";
import type { Payment, BillPayment } from "@/lib/bisnis/client";
import { buildReportFilter, reportDimensionSummary } from "@/lib/bisnis/report-filters";
import { useReportDimensions } from "@/lib/bisnis/use-report-dimensions";
import { ReportDimensionFilters } from "@/components/bisnis/ReportDimensionFilters";

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

type PeriodType = "bulan_ini" | "bulan_lalu" | "3_bulan";

function getDateRange(period: PeriodType) {
  const now = new Date();
  let from: Date;
  let to: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  switch (period) {
    case "bulan_lalu":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case "3_bulan":
      from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

type CashEntry = {
  id: string;
  date: string;
  label: string;
  reference?: string;
  amount: number;
  direction: "in" | "out";
  kind: "payment" | "bill_payment" | "expense";
};

export default function ArusKasPage() {
  const {
    companyId,
    companyName,
    stores,
    warehouses,
    cashAccounts,
    storeId,
    setStoreId,
    warehouseId,
    setWarehouseId,
    cashAccountId,
    setCashAccountId,
    dimensions,
  } = useReportDimensions();

  const [period, setPeriod] = useState<PeriodType>("bulan_ini");
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [summary, setSummary] = useState({ masuk: 0, keluar: 0, net: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = getDateRange(period);
      const dateFrom = range.from;
      const dateTo = range.to;

      const payFilter = buildReportFilter(`payment_date >= "${dateFrom}" && payment_date <= "${dateTo}"`, {
        companyId,
        cashAccountId,
        storeId,
        storeField: "invoice.store",
      });
      const billPayFilter = buildReportFilter(`payment_date >= "${dateFrom}" && payment_date <= "${dateTo}"`, {
        companyId,
        cashAccountId,
      });
      const expFilter = buildReportFilter(
        `expense_date >= "${dateFrom}" && expense_date <= "${dateTo}" && status != "cancelled" && status != "draft" && cash_account != ""`,
        { companyId, cashAccountId, storeId, warehouseId },
      );

      const [payments, billPayments, expenses] = await Promise.all([
        pb.collection(BISNIS_COLLECTIONS.payments).getFullList<Payment>({
          filter: payFilter,
          expand: "payment_method",
          sort: "-payment_date",
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.billPayments).getFullList<BillPayment>({
          filter: billPayFilter,
          sort: "-payment_date",
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.expenses).getFullList<Expense>({
          filter: expFilter,
          expand: "cash_account,store",
          sort: "-expense_date",
          requestKey: null,
        }),
      ]);

      const rows: CashEntry[] = [];

      for (const p of payments) {
        const isRefund = p.payment_kind === "refund";
        rows.push({
          id: `pay-${p.id}`,
          date: p.payment_date,
          label: isRefund ? "Refund penjualan" : "Penerimaan invoice",
          reference: p.reference_no,
          amount: p.amount,
          direction: isRefund ? "out" : "in",
          kind: "payment",
        });
      }

      for (const bp of billPayments) {
        rows.push({
          id: `bill-${bp.id}`,
          date: bp.payment_date,
          label: "Pembayaran hutang pembelian",
          reference: bp.reference_no,
          amount: bp.amount,
          direction: "out",
          kind: "bill_payment",
        });
      }

      for (const e of expenses) {
        if (!e.cash_account) continue;
        rows.push({
          id: `exp-${e.id}`,
          date: e.expense_date,
          label: e.description || `Biaya ${e.category}`,
          reference: e.expense_no,
          amount: e.total ?? e.amount,
          direction: "out",
          kind: "expense",
        });
      }

      rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

      const masuk = rows.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0);
      const keluar = rows.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0);

      setEntries(rows);
      setSummary({ masuk, keluar, net: masuk - keluar });
    } catch (err) {
      console.error("Arus kas load error:", err);
    } finally {
      setLoading(false);
    }
  }, [period, companyId, storeId, warehouseId, cashAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const dimSummary = reportDimensionSummary(dimensions, { stores, warehouses, cashAccounts });

  const periodLabel: Record<PeriodType, string> = {
    bulan_ini: "Bulan ini",
    bulan_lalu: "Bulan lalu",
    "3_bulan": "3 bulan terakhir",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/keuangan"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Keuangan
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Arus Kas</h1>
            <p className="mt-1 text-sm text-slate-500">
              Gabungan penerimaan invoice, pembayaran hutang, dan pengeluaran operasional
              {dimSummary ? ` · ${dimSummary}` : ""}
            </p>
          </div>
          <div className="relative">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodType)}
              className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-slate-700 shadow-sm"
            >
              {(Object.keys(periodLabel) as PeriodType[]).map((k) => (
                <option key={k} value={k}>
                  {periodLabel[k]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>

      <ReportDimensionFilters
        companyName={companyName}
        stores={stores}
        warehouses={warehouses}
        cashAccounts={cashAccounts}
        storeId={storeId}
        onStoreChange={setStoreId}
        warehouseId={warehouseId}
        onWarehouseChange={setWarehouseId}
        cashAccountId={cashAccountId}
        onCashAccountChange={setCashAccountId}
        showStore
        showWarehouse
        showCashAccount
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium text-emerald-700">Kas Masuk</p>
          <p className="mt-1 text-lg font-bold text-emerald-900">{currency(summary.masuk)}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-700">Kas Keluar</p>
          <p className="mt-1 text-lg font-bold text-red-900">{currency(summary.keluar)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Neto</p>
          <p className={`mt-1 text-lg font-bold ${summary.net >= 0 ? "text-slate-900" : "text-red-700"}`}>
            {currency(summary.net)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-800">Transaksi</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Tidak ada transaksi pada periode ini</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-4 px-5 py-3.5">
                <div
                  className={
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg " +
                    (e.direction === "in" ? "bg-emerald-50" : "bg-red-50")
                  }
                >
                  {e.direction === "in" ? (
                    <ArrowDown className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <ArrowUp className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{e.label}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(e.date).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {e.reference ? ` · ${e.reference}` : ""}
                  </p>
                </div>
                <span
                  className={
                    "text-sm font-semibold " + (e.direction === "in" ? "text-emerald-700" : "text-red-700")
                  }
                >
                  {e.direction === "in" ? "+" : "−"}
                  {currency(e.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
