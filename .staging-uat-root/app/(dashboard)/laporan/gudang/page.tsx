"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Activity, Loader2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { useLocale } from "@/components/LocaleProvider";

export default function LaporanGudangPage() {
  const { t, locale } = useLocale();
  const [loading, setLoading] = useState(true);
  const [todayCount, setTodayCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0);
  const [byType, setByType] = useState<{ type: string; count: number }[]>([]);
  const [recent, setRecent] = useState<{ id: string; type: string; at: string; user?: string }[]>([]);

  const dateLocale = locale === "en" ? "en-US" : "id-ID";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();

      const [todayRes, weekRes, recentRes] = await Promise.all([
        pb.collection(INV_COLLECTIONS.staffActivities).getList(1, 1, {
          filter: `occurred_at >= "${dayStart}"`,
          requestKey: null,
        }),
        pb.collection(INV_COLLECTIONS.staffActivities).getList(1, 1, {
          filter: `occurred_at >= "${weekStart}"`,
          requestKey: null,
        }),
        pb.collection(INV_COLLECTIONS.staffActivities).getList(1, 30, {
          sort: "-occurred_at",
          expand: "user",
          requestKey: null,
        }),
      ]);

      setTodayCount(todayRes.totalItems);
      setWeekCount(weekRes.totalItems);

      const typeMap = new Map<string, number>();
      for (const row of recentRes.items) {
        const typ = String((row as { activity_type?: string }).activity_type ?? "lainnya");
        typeMap.set(typ, (typeMap.get(typ) ?? 0) + 1);
      }
      setByType([...typeMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count));

      setRecent(
        recentRes.items.map((row) => {
          const r = row as {
            id: string;
            activity_type?: string;
            occurred_at?: string;
            expand?: { user?: { name?: string; email?: string } };
          };
          return {
            id: r.id,
            type: r.activity_type ?? "—",
            at: r.occurred_at ?? "",
            user: r.expand?.user?.name ?? r.expand?.user?.email,
          };
        }),
      );
    } catch (err) {
      console.error("Laporan gudang:", err);
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
            <h1 className="text-2xl font-bold text-slate-900">{t("laporan.gudang.title")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("laporan.gudang.subtitle")}</p>
          </div>
          <Link href="/gudang/aktivitas" className="text-sm font-medium text-indigo-600 hover:underline">
            {t("laporan.common.fullLog")}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs text-indigo-700">{t("laporan.gudang.statToday")}</p>
              <p className="text-2xl font-bold text-indigo-900">{todayCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{t("laporan.gudang.statWeek")}</p>
              <p className="text-2xl font-bold text-slate-900">{weekCount}</p>
            </div>
          </div>

          {byType.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold text-slate-800">{t("laporan.gudang.activityTypes")}</h2>
              <div className="flex flex-wrap gap-2">
                {byType.map((b) => (
                  <span key={b.type} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {b.type}: {b.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-800">{t("laporan.gudang.recentTitle")}</h2>
            </div>
            {recent.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">{t("laporan.gudang.empty")}</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                    <Activity className="h-4 w-4 shrink-0 text-cyan-600" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800">{r.type}</p>
                      <p className="text-xs text-slate-500">
                        {r.user ?? "—"}
                        {r.at ? ` · ${new Date(r.at).toLocaleString(dateLocale)}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
