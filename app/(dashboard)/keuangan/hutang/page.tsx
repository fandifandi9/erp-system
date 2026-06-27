"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, CreditCard } from "lucide-react";
import { fetchPurchaseBills } from "@/lib/bisnis/client";
import type { PurchaseBill } from "@/lib/bisnis/types";
import { KeuanganSubpageShell } from "@/components/keuangan/KeuanganSubpageShell";
import { useWorkContext } from "@/components/WorkContextProvider";

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export default function HutangPage() {
  const { context: workCtx } = useWorkContext();
  const companyId = workCtx?.companyId;
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPurchaseBills({
        page: 1,
        perPage: 500,
        filter: `status != "paid" && status != "cancelled"`,
        sort: "-due_date",
        expand: "supplier",
        companyId,
      });
      setBills(res.items);
      setTotal(res.items.reduce((s, b) => s + (b.remaining ?? 0), 0));
    } catch (err) {
      console.error("Hutang load error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <KeuanganSubpageShell
      title="Hutang Supplier"
      description={
        workCtx?.companyName
          ? `Tagihan pembelian belum lunas — ${workCtx.companyName}`
          : "Tagihan pembelian yang belum lunas"
      }
      action={
        <Link href="/bisnis/pembelian" className="text-sm font-medium text-indigo-600 hover:underline">
          Buka tagihan pembelian →
        </Link>
      }
    >
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <p className="text-xs font-medium text-red-700">Total hutang</p>
        <p className="text-2xl font-bold text-red-900">{currency(total)}</p>
        <p className="mt-1 text-xs text-red-800">{bills.length} tagihan belum lunas</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          </div>
        ) : bills.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Tidak ada hutang terbuka</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {bills.map((b) => (
              <div key={b.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50">
                  <CreditCard className="h-4 w-4 text-red-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/bisnis/pembelian/${b.id}`}
                    className="text-sm font-medium text-slate-800 hover:text-indigo-600"
                  >
                    {b.bill_no}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {b.expand?.supplier?.name ?? "—"}
                    {b.due_date
                      ? ` · Jatuh tempo ${new Date(b.due_date).toLocaleDateString("id-ID")}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{currency(b.remaining ?? 0)}</p>
                  <p className="text-xs text-slate-400">dari {currency(b.total ?? 0)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </KeuanganSubpageShell>
  );
}
