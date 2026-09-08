"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  downloadPayrollXlsxForPeriod,
  createPayrollPeriod,
  defaultMonthPeriod,
  fetchActivePayrollSetting,
  fetchPayrollItemsByPeriod,
  fetchPayrollPeriods,
  generatePayrollItems,
  isPayrollPeriodLockedForRegenerate,
  updatePayrollPeriodStatus,
  type PayrollItemView,
  type PayrollPeriod,
} from "@/lib/payroll";
import { Download, Loader2, Plus, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

export default function PayrollPage() {
  const { t, locale } = useLocale();
  const moneyFmt = useMemo(
    () => new Intl.NumberFormat(locale === "en" ? "en-US" : "id-ID"),
    [locale],
  );
  const money = (n: number) => moneyFmt.format(Math.round(n || 0));

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [items, setItems] = useState<PayrollItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);

  const [newPeriod, setNewPeriod] = useState(() => defaultMonthPeriod());
  const [settingsId, setSettingsId] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [allPeriods, setting] = await Promise.all([
        fetchPayrollPeriods(),
        fetchActivePayrollSetting(),
      ]);
      setPeriods(allPeriods);
      setSettingsId(setting?.id || "");
      setSelectedPeriod((prev) => prev || (allPeriods[0]?.id ?? ""));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("hr.payroll.loadFailed");
      setPageError(msg);
      setPeriods([]);
      setSettingsId("");
      setSelectedPeriod("");
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadItems = useCallback(async () => {
    if (!selectedPeriod) {
      setItems([]);
      return;
    }
    setRefreshing(true);
    try {
      const rows = await fetchPayrollItemsByPeriod(selectedPeriod);
      setItems(rows);
    } finally {
      setRefreshing(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const selected = useMemo(
    () => periods.find((p) => p.id === selectedPeriod) ?? null,
    [periods, selectedPeriod],
  );

  const periodLocked = selected ? isPayrollPeriodLockedForRegenerate(selected.status) : false;

  const totals = useMemo(() => {
    return items.reduce(
      (acc, x) => {
        acc.gross += x.gross_amount;
        acc.deduction += x.total_deduction;
        acc.net += x.net_amount;
        return acc;
      },
      { gross: 0, deduction: 0, net: 0 },
    );
  }, [items]);

  const createPeriodNow = async () => {
    if (!settingsId) {
      alert(t("hr.payroll.noSettingsAlert"));
      return;
    }
    setWorking(true);
    const out = await createPayrollPeriod({
      ...newPeriod,
      settings: settingsId,
    });
    setWorking(false);
    alert(out.message);
    if (out.success) {
      await loadPage();
      if (out.period?.id) setSelectedPeriod(out.period.id);
    }
  };

  const runGenerate = async () => {
    if (!selectedPeriod) return;
    setWorking(true);
    const out = await generatePayrollItems(selectedPeriod);
    setWorking(false);
    alert(out.message);
    if (out.success) await loadItems();
  };

  const exportExcel = async () => {
    if (!selectedPeriod) return;
    setWorking(true);
    try {
      await downloadPayrollXlsxForPeriod(selectedPeriod);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : t("hr.payroll.exportFailed"));
    } finally {
      setWorking(false);
    }
  };

  const updateStatus = async (status: PayrollPeriod["status"]) => {
    if (!selectedPeriod) return;
    setWorking(true);
    const out = await updatePayrollPeriodStatus(selectedPeriod, status);
    setWorking(false);
    alert(out.message);
    if (out.success) {
      await loadPage();
      await loadItems();
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t("hr.payroll.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("hr.payroll.subtitle")}</p>
        <p className="mt-2 text-xs text-slate-500">{t("hr.payroll.periodHint")}</p>
      </div>

      {pageError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">{t("hr.payroll.loadErrorTitle")}</p>
          <p className="mt-1 break-all font-mono text-xs">{pageError}</p>
          <p className="mt-2 text-red-800">{t("hr.payroll.loadErrorHint")}</p>
        </div>
      )}

      {!pageError && !loading && !settingsId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">{t("hr.payroll.noSettingsTitle")}</p>
          <p className="mt-1">{t("hr.payroll.noSettingsDesc")}</p>
          <p className="mt-2 text-amber-900">{t("hr.payroll.noSettingsHint")}</p>
        </div>
      )}

      {!pageError && !loading && settingsId && periods.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {t("hr.payroll.noPeriods")}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-800">{t("hr.payroll.createSection")}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            value={newPeriod.period_key}
            onChange={(e) =>
              setNewPeriod((p) => ({
                ...p,
                period_key: e.target.value,
                name: `Payroll ${e.target.value}`,
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="2026-05"
          />
          <input
            type="date"
            value={newPeriod.start_date}
            onChange={(e) => setNewPeriod((p) => ({ ...p, start_date: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={newPeriod.end_date}
            onChange={(e) => setNewPeriod((p) => ({ ...p, end_date: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={newPeriod.pay_date}
            onChange={(e) => setNewPeriod((p) => ({ ...p, pay_date: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void createPeriodNow()}
            disabled={working || !settingsId || !!pageError}
            title={!settingsId ? t("hr.payroll.createPeriodTitle") : undefined}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("hr.payroll.createPeriod")}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-800">{t("hr.payroll.processSection")}</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadItems()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              {t("hr.payroll.refresh")}
            </button>
            <button
              type="button"
              onClick={() => void exportExcel()}
              disabled={!selectedPeriod || working || items.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {t("hr.payroll.exportExcel")}
            </button>
            <button
              type="button"
              onClick={() => void runGenerate()}
              disabled={!selectedPeriod || working || periodLocked}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {t("hr.payroll.generateItems")}
            </button>
            <button
              type="button"
              onClick={() => void updateStatus("approved")}
              disabled={!selectedPeriod || working || periodLocked}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {t("hr.payroll.approvePeriod")}
            </button>
            <button
              type="button"
              onClick={() => void updateStatus("paid")}
              disabled={!selectedPeriod || working}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {t("hr.payroll.markPaid")}
            </button>
            <button
              type="button"
              onClick={() => void updateStatus("closed")}
              disabled={!selectedPeriod || working}
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {t("hr.payroll.closePeriod")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t("hr.payroll.selectPeriod")}</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.period_key} ({p.status})
              </option>
            ))}
          </select>
          <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
            {t("hr.payroll.start")}{" "}
            <span className="font-medium text-slate-800">{selected?.start_date || "-"}</span>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
            {t("hr.payroll.end")}{" "}
            <span className="font-medium text-slate-800">{selected?.end_date || "-"}</span>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
            {t("hr.payroll.status")}{" "}
            <span className="font-medium text-slate-800">{selected?.status || "-"}</span>
          </div>
        </div>
        {periodLocked && <p className="mt-2 text-xs text-amber-800">{t("hr.payroll.lockedHint")}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{t("hr.payroll.totalGross")}</p>
          <p className="text-xl font-bold text-slate-900">Rp {money(totals.gross)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{t("hr.payroll.totalDeduction")}</p>
          <p className="text-xl font-bold text-red-700">Rp {money(totals.deduction)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{t("hr.payroll.totalNet")}</p>
          <p className="text-xl font-bold text-green-700">Rp {money(totals.net)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">{t("hr.payroll.colEmployee")}</th>
              <th className="px-3 py-2 text-right">{t("hr.payroll.colBase")}</th>
              <th className="px-3 py-2 text-right">{t("hr.payroll.colOvertime")}</th>
              <th className="px-3 py-2 text-right">{t("hr.payroll.colBonus")}</th>
              <th className="px-3 py-2 text-right">{t("hr.payroll.colLeaveComp")}</th>
              <th className="px-3 py-2 text-right">{t("hr.payroll.colLateDed")}</th>
              <th className="px-3 py-2 text-right">{t("hr.payroll.colAbsenceDed")}</th>
              <th className="px-3 py-2 text-right">{t("hr.payroll.colNet")}</th>
            </tr>
          </thead>
          <tbody>
            {refreshing ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("hr.payroll.loadingItems")}
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                  {t("hr.payroll.emptyItems")}
                </td>
              </tr>
            ) : (
              items.map((x) => (
                <tr key={x.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-900">{x.employee_name}</p>
                    <p className="text-xs text-slate-500">
                      {x.attendance_bonus_eligible
                        ? t("hr.payroll.bonusEligible")
                        : t("hr.payroll.bonusForfeited")}{" "}
                      | {t("hr.payroll.encashDays", { count: x.leave_encashment_days })}
                    </p>
                    {(x.attendance_bonus_reason || x.leave_encashment_reason) && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {x.attendance_bonus_reason && (
                          <span>
                            {t("hr.payroll.bonusReason")} {x.attendance_bonus_reason}.{" "}
                          </span>
                        )}
                        {x.leave_encashment_reason && (
                          <span>
                            {t("hr.payroll.leaveReason")} {x.leave_encashment_reason}
                          </span>
                        )}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">Rp {money(x.base_salary)}</td>
                  <td className="px-3 py-2 text-right">Rp {money(x.overtime_amount)}</td>
                  <td className="px-3 py-2 text-right">Rp {money(x.attendance_bonus_amount)}</td>
                  <td className="px-3 py-2 text-right">Rp {money(x.leave_encashment_amount)}</td>
                  <td className="px-3 py-2 text-right text-red-700">Rp {money(x.late_deduction)}</td>
                  <td className="px-3 py-2 text-right text-red-700">Rp {money(x.absence_deduction)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700">
                    Rp {money(x.net_amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
