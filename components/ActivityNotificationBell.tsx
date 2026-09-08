"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, Loader2 } from "lucide-react";
import { formatActivityEventLabel } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import {
  activitySeverityClass,
  parseActivityPayload,
  resolveActivityActionUrl,
} from "@/lib/tenant/activity-links";
import type { ActivityEvent } from "@/lib/tenant/types";

const SEEN_KEY = "serba_activity_seen_at";

function readSeenAt(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SEEN_KEY) ?? "";
}

function writeSeenAt(iso: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SEEN_KEY, iso);
}

function formatEventTime(iso: string, locale: "id" | "en"): string {
  return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityNotificationBell() {
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const loadedOnceRef = useRef(false);

  const tRef = useRef(t);
  tRef.current = t;

  const applyUnread = useCallback((list: ActivityEvent[]) => {
    const seen = readSeenAt();
    const count = seen
      ? list.filter((ev) => ev.occurred_at > seen).length
      : list.length > 0
        ? Math.min(list.length, 99)
        : 0;
    setUnread(count);
  }, []);

  const load = useCallback(
    async (opts?: { background?: boolean; signal?: { cancelled: boolean } }) => {
      const background = opts?.background ?? loadedOnceRef.current;
      if (background) setRefreshing(true);
      else setInitialLoading(true);
      setLoadError("");
      try {
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const params = new URLSearchParams({ limit: "20", since, forMe: "1" });
        const res = await fetch(`/api/tenant/activity?${params}`, { credentials: "include" });
        if (opts?.signal?.cancelled) return;
        if (!res.ok) throw new Error("fetch");
        const json = (await res.json()) as { items: ActivityEvent[] };
        if (opts?.signal?.cancelled) return;
        const list = json.items ?? [];
        setItems(list);
        applyUnread(list);
        loadedOnceRef.current = true;
      } catch {
        if (opts?.signal?.cancelled) return;
        if (!loadedOnceRef.current) {
          setItems([]);
          setUnread(0);
        }
        setLoadError(tRef.current("activity.loadError"));
      } finally {
        if (!opts?.signal?.cancelled) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [applyUnread],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load({ signal });
    const timer = setInterval(() => void load({ background: true, signal }), 60_000);
    return () => {
      signal.cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    if (!loadedOnceRef.current) void load();
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, load]);

  const markRead = () => {
    writeSeenAt(new Date().toISOString());
    setUnread(0);
  };

  const showSpinner = initialLoading && items.length === 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markRead();
        }}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        aria-label={t("activity.title")}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-1.5rem,22rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{t("activity.title")}</p>
              {refreshing ? (
                <p className="text-[10px] text-slate-400">{t("activity.refreshing")}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={markRead}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              {t("activity.markRead")}
            </button>
          </div>

          {showSpinner ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            </div>
          ) : loadError && items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-red-600">{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
              >
                {t("common.retry")}
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">{t("activity.emptyAll")}</p>
          ) : (
            <ul className="max-h-[min(60vh,20rem)] divide-y divide-slate-100 overflow-y-auto">
              {items.map((ev) => {
                const payload = parseActivityPayload(ev.payload_json);
                const label = formatActivityEventLabel(
                  locale,
                  ev.event_code,
                  payload,
                  ev.entity_label,
                );
                const href = resolveActivityActionUrl(ev, payload);
                const time = ev.occurred_at ? formatEventTime(ev.occurred_at, locale) : "—";
                const moduleLabel = t(`activity.modules.${ev.module}` as "activity.modules.sales");

                return (
                  <li key={ev.id}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className="group flex items-start gap-2 px-4 py-3 transition hover:bg-slate-50"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activitySeverityClass(ev.severity)}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-slate-400">{time}</p>
                        <p className="text-sm font-medium leading-snug text-slate-800 group-hover:text-indigo-700">
                          {label}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {moduleLabel}
                          </span>
                          {ev.expand?.store?.name ? (
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700">
                              {ev.expand.store.name}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-center">
            <Link
              href="/aktivitas"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              {t("common.seeAll")} →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
