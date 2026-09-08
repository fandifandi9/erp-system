"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Loader2 } from "lucide-react";
import { formatActivityEventLabel } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import type { ActivityEvent } from "@/lib/tenant/types";

const SEEN_KEY = "serba_activity_seen_at";

function parsePayload(raw?: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readSeenAt(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SEEN_KEY) ?? "";
}

function writeSeenAt(iso: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SEEN_KEY, iso);
}

export function ActivityNotificationBell() {
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const params = new URLSearchParams({ limit: "20", since, forMe: "1" });
      const res = await fetch(`/api/tenant/activity?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch");
      const json = (await res.json()) as { items: ActivityEvent[] };
      const list = json.items ?? [];
      setItems(list);
      const seen = readSeenAt();
      const count = seen
        ? list.filter((ev) => ev.occurred_at > seen).length
        : list.length > 0
          ? Math.min(list.length, 9)
          : 0;
      setUnread(count);
    } catch {
      setItems([]);
      setUnread(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const markRead = () => {
    writeSeenAt(new Date().toISOString());
    setUnread(0);
  };

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
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">{t("activity.title")}</p>
            <button
              type="button"
              onClick={markRead}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              {t("activity.markRead")}
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">{t("activity.emptyAll")}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-50 overflow-y-auto">
              {items.map((ev) => {
                const payload = parsePayload(ev.payload_json);
                const label = formatActivityEventLabel(
                  locale,
                  ev.event_code,
                  payload,
                  ev.entity_label,
                );
                const actionUrl =
                  typeof payload.action_url === "string" ? payload.action_url : null;
                const time = ev.occurred_at
                  ? new Date(ev.occurred_at).toLocaleString(locale === "en" ? "en-US" : "id-ID", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";
                return (
                  <li key={ev.id} className="px-4 py-2.5 text-sm">
                    <p className="text-[10px] text-slate-400">{time}</p>
                    {actionUrl ? (
                      <Link
                        href={actionUrl}
                        onClick={() => setOpen(false)}
                        className="text-slate-800 hover:text-indigo-600 hover:underline"
                      >
                        {label}
                      </Link>
                    ) : (
                      <p className="text-slate-800">{label}</p>
                    )}
                    {ev.expand?.store?.name ? (
                      <p className="text-[10px] text-violet-600">{ev.expand.store.name}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-slate-100 px-4 py-2.5 text-center">
            <Link
              href="/aktivitas"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              {t("common.seeAll")} →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
