"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LineChart, Loader2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { SalesImportBatch } from "@/lib/bisnis/types";
import { useLocale } from "@/components/LocaleProvider";

export default function LaporanMarketplacePage() {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [posted, setPosted] = useState(0);
  const [failed, setFailed] = useState(0);
  const [pending, setPending] = useState(0);
  const [batches, setBatches] = useState<SalesImportBatch[]>([]);

  const statusLabel = useMemo(
    () =>
      ({
        draft: t("laporan.marketplace.statusDraft"),
        validated: t("laporan.marketplace.statusValidated"),
        posted: t("laporan.marketplace.statusPosted"),
        cancelled: t("laporan.marketplace.statusCancelled"),
      }) as Record<string, string>,
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pb.collection(BISNIS_COLLECTIONS.salesImportBatches).getList<SalesImportBatch>(1, 50, {
        sort: "-created",
        requestKey: null,
      });
      setBatches(res.items);
      setTotal(res.totalItems);
      setPosted(res.items.filter((b) => b.status === "posted").length);
      setFailed(res.items.filter((b) => b.status === "cancelled" || b.error_rows > 0).length);
      setPending(res.items.filter((b) => b.status === "draft" || b.status === "validated").length);
    } catch (err) {
      console.error("Laporan marketplace:", err);
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
            <h1 className="text-2xl font-bold text-slate-900">{t("laporan.marketplace.title")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("laporan.marketplace.subtitle")}</p>
          </div>
          <Link href="/bisnis/penjualan/riwayat-import" className="text-sm font-medium text-indigo-600 hover:underline">
            {t("laporan.common.fullHistory")}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{t("laporan.marketplace.statTotal")}</p>
              <p className="text-xl font-bold text-slate-900">{total}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs text-emerald-700">{t("laporan.marketplace.statPosted")}</p>
              <p className="text-xl font-bold text-emerald-900">{posted}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-700">{t("laporan.marketplace.statPending")}</p>
              <p className="text-xl font-bold text-amber-900">{pending}</p>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs text-red-700">{t("laporan.marketplace.statFailed")}</p>
              <p className="text-xl font-bold text-red-900">{failed}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-800">{t("laporan.marketplace.recentBatches")}</h2>
            </div>
            {batches.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">{t("laporan.marketplace.empty")}</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {batches.map((b) => (
                  <Link
                    key={b.id}
                    href={`/bisnis/penjualan/import/${b.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50"
                  >
                    <LineChart className="h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{b.batch_no}</p>
                      <p className="text-xs text-slate-500">
                        {b.source_filename ?? "—"} ·{" "}
                        {t("laporan.marketplace.validRows", { valid: b.valid_rows, total: b.total_rows })}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-slate-600">
                      {statusLabel[b.status] ?? b.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
