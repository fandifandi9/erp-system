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

const MODULES = ["", "sales", "warehouse", "purchase", "finance", "hr", "settings"] as const;

export default function AktivitasPage() {
  const { locale, t } = useLocale();
  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const params = new URLSearchParams({ limit: "100", since });
      if (module) params.set("module", module);
      const res = await fetch(`/api/tenant/activity?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch");
      const json = (await res.json()) as { items: ActivityEvent[] };
      setItems(json.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("activity.pageTitle")}</h1>
          <p className="text-sm text-slate-500">{t("activity.pageSubtitle")}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            {t("activity.filterModule")}
          </span>
          <select
            value={module}
            onChange={(e) => setModule(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t("activity.filterAll")}</option>
            {MODULES.filter(Boolean).map((m) => (
              <option key={m} value={m}>
                {t(`activity.modules.${m}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">{t("activity.emptyAll")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((ev) => {
              const payload = parseActivityPayload(ev.payload_json);
              const label = formatActivityEventLabel(
                locale,
                ev.event_code,
                payload,
                ev.entity_label,
              );
              const href = resolveActivityActionUrl(ev, payload);
              const time = ev.occurred_at
                ? new Date(ev.occurred_at).toLocaleString(locale === "en" ? "en-US" : "id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—";
              return (
                <li key={ev.id}>
                  <Link
                    href={href}
                    className="group flex items-start gap-3 px-5 py-4 text-sm transition hover:bg-slate-50"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activitySeverityClass(ev.severity)}`}
                    />
                    <span className="w-32 shrink-0 font-mono text-xs text-slate-400">{time}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 group-hover:text-indigo-700">{label}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                          {t(`activity.modules.${ev.module}` as "activity.modules.sales")}
                        </span>
                        {ev.expand?.store?.name ? (
                          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
                            {ev.expand.store.name}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
