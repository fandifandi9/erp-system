"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  Truck,
} from "lucide-react";
import { WmsCard } from "@/components/wms/ui";
import type { SalesOrder } from "@/lib/bisnis/types";
import { loadCompleteQueue } from "@/lib/wms/outbound-queues";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import { buildWmsOrderHeader } from "@/lib/wms/wms-order-display";
import { getPkIdentityView } from "@/lib/wms/pk-identity";
import { getPackageIdentityView } from "@/lib/wms/package-identity";
import { pkCodeBody } from "@/lib/wms/pk-number";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";

type ReportRow = {
  so: SalesOrder;
  /** Kode label utama (AWB atau PK body). */
  packageCode: string;
  pkNo: string;
  awb: string;
  orderNo: string;
  store: string;
  courierCompany: string;
  driver: string;
  driverPhone: string;
  ttNo: string;
  batchId: string;
  completedAt: string;
  completedMs: number;
};

type CourierHandoverGroup = {
  key: string;
  driver: string;
  courierCompany: string;
  driverPhone: string;
  ttNo: string;
  at: string;
  atMs: number;
  packages: ReportRow[];
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0).getTime();
}

function endOfDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999).getTime();
}

function buildRow(so: SalesOrder): ReportRow {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const h = buildWmsOrderHeader(so);
  const pk = getPkIdentityView(so);
  const pkg = getPackageIdentityView(so, wf);
  const pickup = wf.pickup;
  const completedAt = pickup?.at ?? so.updated ?? so.created ?? "";

  const awbFromTt =
    pickup?.tt_lines?.find((l) => l.so_id === so.id)?.awb?.trim() ||
    pickup?.physical_scan_code?.trim() ||
    "";
  const awb =
    (pkg.type === "awb" && pkg.code !== "—" ? pkg.code.trim() : "") ||
    (awbFromTt && awbFromTt !== "—" ? awbFromTt : "") ||
    "";
  const pkNo = pk.pkNo !== "—" ? pk.pkNo : "";
  const packageCode = awb || pkNo || h.orderNo || "—";

  const store =
    wf.order_meta?.store_name?.trim() ||
    so.expand?.store?.name?.trim() ||
    (h.warehouseName !== "—" ? h.warehouseName : "") ||
    "—";

  return {
    so,
    packageCode,
    pkNo,
    awb,
    orderNo: h.orderNo,
    store,
    courierCompany: pickup?.courier_company?.trim() || h.courier || "—",
    driver: pickup?.driver_name?.trim() || "—",
    driverPhone: pickup?.driver_phone?.trim() || "",
    ttNo: pickup?.tt_no?.trim() || "",
    batchId: pickup?.batch_id?.trim() || "",
    completedAt,
    completedMs: completedAt ? new Date(completedAt).getTime() : 0,
  };
}

function groupKey(r: ReportRow): string {
  if (r.ttNo) return `tt:${r.ttNo}`;
  if (r.batchId) return `batch:${r.batchId}`;
  const minute = r.completedMs ? Math.floor(r.completedMs / 60_000) : 0;
  return `drv:${r.driver}|${r.courierCompany}|${minute}`;
}

function groupHandovers(rows: ReportRow[]): CourierHandoverGroup[] {
  const map = new Map<string, CourierHandoverGroup>();
  for (const r of rows) {
    const key = groupKey(r);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        driver: r.driver,
        courierCompany: r.courierCompany,
        driverPhone: r.driverPhone,
        ttNo: r.ttNo,
        at: r.completedAt,
        atMs: r.completedMs,
        packages: [r],
      });
      continue;
    }
    existing.packages.push(r);
    if (r.completedMs && (!existing.atMs || r.completedMs < existing.atMs)) {
      existing.atMs = r.completedMs;
      existing.at = r.completedAt;
    }
    if (!existing.ttNo && r.ttNo) existing.ttNo = r.ttNo;
    if (!existing.driverPhone && r.driverPhone) existing.driverPhone = r.driverPhone;
  }
  return [...map.values()].sort((a, b) => b.atMs - a.atMs);
}

function codeMatches(row: ReportRow, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return false;
  const variants = [
    row.packageCode,
    row.pkNo,
    row.awb,
    row.orderNo,
    pkCodeBody(row.pkNo),
    row.ttNo,
  ]
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return variants.some((v) => v === n || v.includes(n));
}

export default function WmsSelesaiPage() {
  const { t, locale } = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "id-ID";

  const today = useMemo(() => toDateInputValue(new Date()), []);
  const weekAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toDateInputValue(d);
  }, []);

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [q, setQ] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const fmtShort = (iso?: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(dateLocale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await loadCompleteQueue();
      setRows(list.map(buildRow).sort((a, b) => b.completedMs - a.completedMs));
    } catch (e) {
      setError(getErrorMessage(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const inDateRange = useCallback(
    (r: ReportRow) => {
      const fromMs = dateFrom ? startOfDay(dateFrom) : 0;
      const toMs = dateTo ? endOfDay(dateTo) : Number.POSITIVE_INFINITY;
      if (!r.completedMs) return true;
      return r.completedMs >= fromMs && r.completedMs <= toMs;
    },
    [dateFrom, dateTo],
  );

  const datedRows = useMemo(() => rows.filter(inDateRange), [rows, inDateRange]);

  const needle = q.trim().toLowerCase();

  /** Hasil pencarian PK/AWB — jelaskan kurir + waktu. */
  const packageHits = useMemo(() => {
    if (!needle || needle.length < 3) return [] as ReportRow[];
    return datedRows.filter((r) => codeMatches(r, needle));
  }, [datedRows, needle]);

  const filteredForGroups = useMemo(() => {
    if (!needle) return datedRows;
    // Jika cocok kode paket, tetap tampilkan grup terkait; else filter nama kurir/ekspedisi/TT.
    if (packageHits.length > 0) {
      const hitKeys = new Set(packageHits.map((r) => groupKey(r)));
      return datedRows.filter((r) => hitKeys.has(groupKey(r)));
    }
    return datedRows.filter((r) => {
      const hay = [r.driver, r.courierCompany, r.ttNo, r.store, r.orderNo].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [datedRows, needle, packageHits]);

  const groups = useMemo(() => groupHandovers(filteredForGroups), [filteredForGroups]);

  const stats = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = dayStart - 6 * 86400000;
    let todayCount = 0;
    let weekCount = 0;
    for (const r of rows) {
      if (!r.completedMs) continue;
      if (r.completedMs >= dayStart) todayCount += 1;
      if (r.completedMs >= weekStart) weekCount += 1;
    }
    return {
      today: todayCount,
      week: weekCount,
      total: rows.length,
      handovers: groups.length,
      packages: filteredForGroups.length,
    };
  }, [rows, groups.length, filteredForGroups.length]);

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t("wms.selesai.reportTitle")}</h2>
          <p className="text-xs text-slate-500">{t("wms.selesai.reportSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t("wms.selesai.refresh")}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="text-[10px] font-medium text-emerald-800">{t("wms.selesai.statToday")}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xl font-bold text-emerald-950">
            <CheckCircle2 className="h-4 w-4" />
            {stats.today}
          </p>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
          <p className="text-[10px] font-medium text-indigo-800">{t("wms.selesai.statWeek")}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xl font-bold text-indigo-950">
            <PackageCheck className="h-4 w-4" />
            {stats.week}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-medium text-slate-500">{t("wms.selesai.statHandovers")}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xl font-bold text-slate-900">
            <Truck className="h-4 w-4 text-slate-400" />
            {stats.handovers}
          </p>
        </div>
      </div>

      <WmsCard>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-xs">
            <span className="text-slate-600">{t("wms.selesai.filterFrom")}</span>
            <input
              type="date"
              className="mt-0.5 block rounded-md border border-slate-200 px-2 py-1.5 text-xs"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-600">{t("wms.selesai.filterTo")}</span>
            <input
              type="date"
              className="mt-0.5 block rounded-md border border-slate-200 px-2 py-1.5 text-xs"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <label className="block min-w-[16rem] flex-1 text-xs">
            <span className="text-slate-600">{t("wms.selesai.search")}</span>
            <span className="relative mt-0.5 block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-2 text-xs"
                placeholder={t("wms.selesai.searchPlaceholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </span>
          </label>
          <p className="pb-1.5 text-[10px] text-slate-500">
            {t("wms.selesai.showingHandovers", {
              groups: String(stats.handovers),
              packages: String(stats.packages),
            })}
          </p>
        </div>
      </WmsCard>

      {packageHits.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-800">
            {t("wms.selesai.lookupTitle")}
          </p>
          {packageHits.slice(0, 5).map((hit) => (
            <div
              key={hit.so.id}
              className="rounded-md border border-cyan-100 bg-white px-2.5 py-2 text-xs text-slate-800"
            >
              <p className="font-mono text-sm font-bold text-indigo-900">{hit.packageCode}</p>
              <p className="mt-0.5 leading-snug">
                {t("wms.selesai.lookupTakenBy", {
                  driver: hit.driver,
                  courier: hit.courierCompany,
                  when: fmtShort(hit.completedAt),
                })}
              </p>
              {hit.ttNo ? (
                <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                  TT {hit.ttNo}
                  {hit.driverPhone ? ` · ${hit.driverPhone}` : ""}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : needle.length >= 3 ? (
        <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t("wms.selesai.lookupEmpty", { q: q.trim() })}
        </p>
      ) : null}

      <WmsCard className="overflow-hidden" padding="p-0">
        <div className="border-b border-slate-100 px-3 py-2">
          <p className="text-xs font-semibold text-slate-800">{t("wms.selesai.courierHistoryTitle")}</p>
          <p className="text-[10px] text-slate-500">{t("wms.selesai.courierHistorySubtitle")}</p>
        </div>
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          </div>
        ) : groups.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-slate-500">{t("wms.selesai.empty")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groups.map((g) => {
              const open = expandedKey === g.key;
              const reprintSoId = g.packages[0]?.so.id;
              return (
                <li key={g.key}>
                  <button
                    type="button"
                    onClick={() => setExpandedKey(open ? null : g.key)}
                    className={
                      "flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 " +
                      (open ? "bg-indigo-50/50" : "")
                    }
                  >
                    <span className="mt-0.5 text-slate-400">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold text-slate-900">{g.driver}</span>
                        <span className="text-[11px] text-slate-500">{g.courierCompany}</span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-600">
                        {t("wms.selesai.handoverSummary", {
                          count: String(g.packages.length),
                          when: fmtShort(g.at),
                        })}
                      </span>
                      {g.ttNo ? (
                        <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                          TT {g.ttNo}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {g.packages.length}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-2">
                      <ol className="space-y-1">
                        {g.packages.map((p, idx) => (
                          <li
                            key={p.so.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          >
                            <span className="flex min-w-0 items-baseline gap-1.5">
                              <span className="w-4 shrink-0 text-slate-400">{idx + 1}.</span>
                              <span className="break-all font-mono text-[12px] font-bold text-indigo-900">
                                {p.packageCode}
                              </span>
                              {p.store && p.store !== "—" ? (
                                <span className="text-[10px] text-slate-500">{p.store}</span>
                              ) : null}
                            </span>
                            <span className="text-[10px] text-slate-500">{fmtShort(p.completedAt)}</span>
                          </li>
                        ))}
                      </ol>
                      {reprintSoId ? (
                        <div className="mt-2">
                          <Link
                            href={`/wms/pickup/tanda-terima/${reprintSoId}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            {t("wms.selesai.reprintReceipt")}
                            {g.ttNo ? ` · ${g.ttNo}` : ""}
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </WmsCard>
    </div>
  );
}
