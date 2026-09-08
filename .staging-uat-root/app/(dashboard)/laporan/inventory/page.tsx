"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Package, AlertTriangle } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { useLocale } from "@/components/LocaleProvider";

type StockRow = {
  productId: string;
  sku: string;
  name: string;
  qty: number;
};

export default function LaporanInventoryPage() {
  const { t, locale } = useLocale();
  const [loading, setLoading] = useState(true);
  const [totalSku, setTotalSku] = useState(0);
  const [totalQty, setTotalQty] = useState(0);
  const [zeroStock, setZeroStock] = useState(0);
  const [topItems, setTopItems] = useState<StockRow[]>([]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-US" : "id-ID", { maximumFractionDigits: 0 }).format(n);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const balances = await pb.collection(INV_COLLECTIONS.balances).getFullList<{
        product: string;
        qty_on_hand?: number;
        expand?: { product?: { id: string; sku: string; name: string } };
      }>({
        fields: "product,qty_on_hand,expand.product",
        expand: "product",
        requestKey: null,
      });

      const byProduct = new Map<string, StockRow>();
      for (const b of balances) {
        const pid = b.product;
        const qty = Number(b.qty_on_hand) || 0;
        const p = b.expand?.product;
        const existing = byProduct.get(pid);
        if (existing) {
          existing.qty += qty;
        } else {
          byProduct.set(pid, {
            productId: pid,
            sku: p?.sku ?? "—",
            name: p?.name ?? pid.slice(0, 8),
            qty,
          });
        }
      }

      const rows = [...byProduct.values()];
      setTotalSku(rows.length);
      setTotalQty(rows.reduce((s, r) => s + r.qty, 0));
      setZeroStock(rows.filter((r) => r.qty <= 0).length);
      setTopItems(rows.sort((a, b) => b.qty - a.qty).slice(0, 15));
    } catch (err) {
      console.error("Laporan inventory:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/laporan" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" />
          {t("laporan.common.back")}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("laporan.inventory.title")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("laporan.inventory.subtitle")}</p>
          </div>
          <Link href="/gudang/stok" className="text-sm font-medium text-indigo-600 hover:underline">
            {t("laporan.common.detailStock")}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{t("laporan.inventory.statSku")}</p>
              <p className="text-2xl font-bold text-slate-900">{fmt(totalSku)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs text-emerald-700">{t("laporan.inventory.statQty")}</p>
              <p className="text-2xl font-bold text-emerald-900">{fmt(totalQty)}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-700">{t("laporan.inventory.statZero")}</p>
              <p className="text-2xl font-bold text-amber-900">{fmt(zeroStock)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-800">{t("laporan.inventory.topTitle")}</h2>
            </div>
            {topItems.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">{t("laporan.inventory.empty")}</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {topItems.map((r) => (
                  <div key={r.productId} className="flex items-center gap-4 px-5 py-3">
                    <Package className="h-4 w-4 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{r.name}</p>
                      <p className="text-xs text-slate-500">{r.sku}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{fmt(r.qty)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {zeroStock > 0 ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                {t("laporan.inventory.zeroWarning", { count: zeroStock })}{" "}
                <Link href="/gudang/stok" className="font-medium underline">
                  {t("laporan.inventory.zeroLink")}
                </Link>
                .
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
