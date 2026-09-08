"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ChevronRight, Loader2 } from "lucide-react";
import { formatActivityEventLabel } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import {
  activitySeverityClass,
  parseActivityPayload,
  resolveActivityActionUrl,
} from "@/lib/tenant/activity-links";
import type { ActivityEvent } from "@/lib/tenant/types";

export function ActivityFeedPanel({
  storeId,
  limit = 30,
  title,
}: {
  storeId?: string;
  limit?: number;
  title?: string;
}) {
  const { locale, t } = useLocale();
  const panelTitle = title ?? t("activity.feedTitle");
  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const params = new URLSearchParams({ limit: String(limit), since: dayStart });
      if (storeId) params.set("storeId", storeId);
      const res = await fetch(`/api/tenant/activity?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      const json = (await res.json()) as { items: ActivityEvent[] };
      setItems(json.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [limit, storeId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-600" />
          <h2 className="font-semibold text-slate-800">{panelTitle}</h2>
        </div>
        <span className="text-xs text-slate-400">{t("common.refreshAuto")}</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">{t("activity.empty")}</div>
      ) : (
        <ul className="divide-y divide-slate-50">
          {items.map((ev) => {
            const payload = parseActivityPayload(ev.payload_json);
            const label = formatActivityEventLabel(
              locale,
              ev.event_code,
              payload,
              ev.entity_label,
            );
            const href = resolveActivityActionUrl(ev, payload);
            const storeName = ev.expand?.store?.name;
            const time = ev.occurred_at
              ? new Date(ev.occurred_at).toLocaleTimeString(locale === "en" ? "en-US" : "id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—";
            return (
              <li key={ev.id}>
                <Link
                  href={href}
                  className="group flex gap-3 px-5 py-3 text-sm transition hover:bg-slate-50"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activitySeverityClass(ev.severity)}`}
                  />
                  <span className="shrink-0 font-mono text-xs text-slate-400">{time}</span>
                  <div className="min-w-0 flex-1">
                    {storeName ? (
                      <span className="mb-0.5 inline-block rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                        {storeName}
                      </span>
                    ) : null}
                    <p className="text-slate-800 group-hover:text-indigo-700">{label}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-slate-100 px-5 py-3 text-center">
        <Link href="/aktivitas" className="text-xs font-medium text-indigo-600 hover:underline">
          {t("common.seeAll")} →
        </Link>
      </div>
    </div>
  );
}
