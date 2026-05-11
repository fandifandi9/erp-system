"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildPayrollCsvForPeriod,
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

function money(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

export default function PayrollPage() {
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
      const msg =
        e instanceof Error ? e.message : "Gagal memuat periode atau pengaturan payroll dari server.";
      setPageError(msg);
      setPeriods([]);
      setSettingsId("");
      setSelectedPeriod("");
    } finally {
      setLoading(false);
    }
  }, []);

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
    [periods, selectedPeriod]
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
      { gross: 0, deduction: 0, net: 0 }
    );
  }, [items]);

  const createPeriodNow = async () => {
    if (!settingsId) {
      alert("Payroll settings aktif belum ditemukan.");
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

  const exportCsv = async () => {
    if (!selectedPeriod) return;
    setWorking(true);
    try {
      const { filename, csv } = await buildPayrollCsvForPeriod(selectedPeriod);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal export CSV");
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
        <h1 className="text-2xl font-bold text-slate-800">Payroll Admin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generate payroll dari absensi, lembur, bonus kerajinan, dan kompensasi cuti tidak diambil.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Dropdown &quot;Pilih periode&quot; hanya berisi periode yang sudah tersimpan di PocketBase. Buat periode baru
          lewat form di bawah (setelah pengaturan payroll ada).
        </p>
      </div>

      {pageError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">Gagal memuat data</p>
          <p className="mt-1 font-mono text-xs break-all">{pageError}</p>
          <p className="mt-2 text-red-800">
            Pastikan koleksi <code className="rounded bg-red-100 px-1">payroll_periods</code> dan{" "}
            <code className="rounded bg-red-100 px-1">payroll_settings</code> ada di PocketBase, dan rule List/View
            mengizinkan akun Anda (owner/hr).
          </p>
        </div>
      )}

      {!pageError && !loading && !settingsId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Pengaturan payroll belum ditemukan</p>
          <p className="mt-1">
            Tombol <strong>Buat periode</strong> tidak akan jalan sampai ada minimal satu record di koleksi{" "}
            <code className="rounded bg-amber-100 px-1">payroll_settings</code> (bisa ditandai{" "}
            <code className="rounded bg-amber-100 px-1">is_active=true</code> — kalau field itu belum ada, aplikasi
            memakai record terbaru).
          </p>
          <p className="mt-2 text-amber-900">
            Di PocketBase Admin: buat koleksi/record sesuai skema Anda, lalu refresh halaman ini.
          </p>
        </div>
      )}

      {!pageError && !loading && settingsId && periods.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Belum ada periode payroll. Isi <strong>period key</strong> dan tanggal di bawah, lalu klik{" "}
          <strong>Buat periode</strong> — setelah itu periode akan muncul di dropdown.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-800">Buat periode payroll</h2>
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
            title={!settingsId ? "Butuh minimal satu payroll_settings di PocketBase" : undefined}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Buat periode
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-800">Periode & proses</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadItems()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={!selectedPeriod || working || items.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void runGenerate()}
              disabled={!selectedPeriod || working || periodLocked}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              Generate item
            </button>
            <button
              type="button"
              onClick={() => void updateStatus("approved")}
              disabled={!selectedPeriod || working || periodLocked}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Approve periode
            </button>
            <button
              type="button"
              onClick={() => void updateStatus("paid")}
              disabled={!selectedPeriod || working}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Tandai paid
            </button>
            <button
              type="button"
              onClick={() => void updateStatus("closed")}
              disabled={!selectedPeriod || working}
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Tutup periode
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">-- Pilih periode --</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.period_key} ({p.status})
              </option>
            ))}
          </select>
          <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
            Start: <span className="font-medium text-slate-800">{selected?.start_date || "-"}</span>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
            End: <span className="font-medium text-slate-800">{selected?.end_date || "-"}</span>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
            Status: <span className="font-medium text-slate-800">{selected?.status || "-"}</span>
          </div>
        </div>
        {periodLocked && (
          <p className="mt-2 text-xs text-amber-800">
            Periode terkunci untuk generate ulang. Export CSV tetap bisa; untuk koreksi besar buat periode baru atau ubah
            status di PocketBase Admin.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Gross</p>
          <p className="text-xl font-bold text-slate-900">Rp {money(totals.gross)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Potongan</p>
          <p className="text-xl font-bold text-red-700">Rp {money(totals.deduction)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Net</p>
          <p className="text-xl font-bold text-green-700">Rp {money(totals.net)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Karyawan</th>
              <th className="px-3 py-2 text-right">Base</th>
              <th className="px-3 py-2 text-right">Lembur</th>
              <th className="px-3 py-2 text-right">Bonus Kerajinan</th>
              <th className="px-3 py-2 text-right">Komp. Cuti</th>
              <th className="px-3 py-2 text-right">Pot. Telat</th>
              <th className="px-3 py-2 text-right">Pot. Alpha</th>
              <th className="px-3 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {refreshing ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat payroll item...
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                  Belum ada payroll item untuk periode ini.
                </td>
              </tr>
            ) : (
              items.map((x) => (
                <tr key={x.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-900">{x.employee_name}</p>
                    <p className="text-xs text-slate-500">
                      {x.attendance_bonus_eligible ? "Bonus eligible" : "Bonus hangus"} | Encash{" "}
                      {x.leave_encashment_days} hari
                    </p>
                    {(x.attendance_bonus_reason || x.leave_encashment_reason) && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {x.attendance_bonus_reason && <span>Bonus: {x.attendance_bonus_reason}. </span>}
                        {x.leave_encashment_reason && <span>Cuti: {x.leave_encashment_reason}</span>}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">Rp {money(x.base_salary)}</td>
                  <td className="px-3 py-2 text-right">Rp {money(x.overtime_amount)}</td>
                  <td className="px-3 py-2 text-right">Rp {money(x.attendance_bonus_amount)}</td>
                  <td className="px-3 py-2 text-right">Rp {money(x.leave_encashment_amount)}</td>
                  <td className="px-3 py-2 text-right text-red-700">Rp {money(x.late_deduction)}</td>
                  <td className="px-3 py-2 text-right text-red-700">Rp {money(x.absence_deduction)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700">Rp {money(x.net_amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}