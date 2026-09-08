"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { fetchAuditLogs } from "@/lib/inventory/client";
import type { InvAuditLog } from "@/lib/inventory/types";
import type { AuditLogEntry } from "@/lib/tenant/types";
import { useLocale } from "@/components/LocaleProvider";

function parseChanges(raw?: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { field: string; before: unknown; after: unknown }[];
  } catch {
    return null;
  }
}

type AuditRow = {
  id: string;
  at: string;
  module: string;
  action: string;
  summary: string;
  user: string;
  changes?: { field: string; before: unknown; after: unknown }[] | null;
};

export default function AuditLogPage() {
  const { t, locale } = useLocale();
  const [invItems, setInvItems] = useState<InvAuditLog[]>([]);
  const [sysItems, setSysItems] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "inventory">("all");

  const dateLocale = locale === "en" ? "en-US" : "id-ID";

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAuditLogs({ page: 1 }).catch(() => [] as InvAuditLog[]),
      fetch("/api/tenant/audit?limit=40", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((j) => (j.items ?? []) as AuditLogEntry[])
        .catch(() => [] as AuditLogEntry[]),
    ])
      .then(([inv, sys]) => {
        setInvItems(inv);
        setSysItems(sys);
      })
      .finally(() => setLoading(false));
  }, []);

  const rows: AuditRow[] =
    tab === "inventory"
      ? invItems.map((r) => ({
          id: r.id,
          at: r.occurred_at,
          module: "warehouse",
          action: r.action,
          summary: `${r.entity_type} · ${r.entity_id.slice(0, 8)}`,
          user: r.expand?.user?.name ?? r.expand?.user?.email ?? "—",
        }))
      : [
          ...sysItems.map((r) => ({
            id: r.id,
            at: r.occurred_at,
            module: r.module,
            action: r.action,
            summary: r.summary || r.entity_label || r.entity_type || "—",
            user: r.expand?.actor?.name ?? r.expand?.actor?.email ?? "—",
            changes: parseChanges(r.changes_json),
          })),
        ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/pengaturan" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" />
          {t("pengaturan.common.back")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{t("pengaturan.audit.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pengaturan.audit.subtitle")}</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "all" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          {t("pengaturan.audit.tabSystem")}
        </button>
        <button
          type="button"
          onClick={() => setTab("inventory")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "inventory" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          {t("pengaturan.audit.tabInventory")}
        </button>
        <Link href="/gudang/audit" className="ml-auto self-center text-sm text-indigo-600 hover:underline">
          {t("pengaturan.audit.detailLink")}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">{t("pengaturan.audit.empty")}</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("pengaturan.audit.colTime")}</th>
                <th className="px-4 py-3">{t("pengaturan.audit.colModule")}</th>
                <th className="px-4 py-3">{t("pengaturan.audit.colAction")}</th>
                <th className="px-4 py-3">{t("pengaturan.audit.colSummary")}</th>
                <th className="px-4 py-3">{t("pengaturan.audit.colUser")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {new Date(row.at).toLocaleString(dateLocale)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.module}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{row.action}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.summary}
                    {"changes" in row && row.changes?.length ? (
                      <p className="mt-1 text-xs text-slate-400">
                        {row.changes.map((c) => `${c.field}: ${String(c.before)} → ${String(c.after)}`).join("; ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
