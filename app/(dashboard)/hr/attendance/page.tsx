"use client";

import { useEffect, useState, useCallback } from "react";
import type { RecordModel } from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { downloadAttendanceXlsx } from "@/lib/export/attendance-xlsx";
import { 
  Users, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Calendar,
  RefreshCw,
  Download,
  Filter,
  TrendingUp,
  MapPin,
  Loader2,
  Camera,
} from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

interface AttendanceData {
  id: string;
  user: string;
  date: string;
  check_in?: string;
  check_out?: string;
  check_in_selfie?: string;
  status: string;
  late_minutes: number;
  work_hours: number;
  distance_meter?: number;
  is_suspicious: boolean;
  expand?: {
    user?: {
      id: string;
      name: string;
      email: string;
    };
  };
  /** Populated when API expand includes user relation */
  userName?: string;
}

export default function HRAttendancePage() {
  const { t, locale } = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "id-ID";
  const [data, setData] = useState<AttendanceData[]>([]);
  const [users, setUsers] = useState<RecordModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // 🔍 FILTERS
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [showSuspicious, setShowSuspicious] = useState(false);
  const [correctTarget, setCorrectTarget] = useState<AttendanceData | null>(null);
  const [correctReason, setCorrectReason] = useState("");
  const [correctCheckOut, setCorrectCheckOut] = useState("");
  const [correctStatus, setCorrectStatus] = useState("");
  const [correctClearOut, setCorrectClearOut] = useState(false);
  const [correctBusy, setCorrectBusy] = useState(false);
  const [correctMsg, setCorrectMsg] = useState<string | null>(null);

  async function submitCorrection() {
    if (!correctTarget) return;
    setCorrectBusy(true);
    setCorrectMsg(null);
    try {
      const body: Record<string, unknown> = { reason: correctReason.trim() };
      if (correctClearOut) body.clear_check_out = true;
      else if (correctCheckOut.trim()) {
        body.check_out = new Date(correctCheckOut).toISOString();
      }
      if (correctStatus.trim()) body.status = correctStatus.trim();
      const res = await fetch(`/api/hr/attendance/${correctTarget.id}/correct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || json.ok === false) {
        setCorrectMsg(json.error || json.message || `HTTP ${res.status}`);
        return;
      }
      setCorrectTarget(null);
      setCorrectReason("");
      setCorrectCheckOut("");
      setCorrectStatus("");
      setCorrectClearOut(false);
      await fetchData(false);
    } catch (e) {
      setCorrectMsg(e instanceof Error ? e.message : "Koreksi gagal");
    } finally {
      setCorrectBusy(false);
    }
  }

  // =========================
  // FETCH USERS (dropdown)
  // =========================
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await pb.collection("users").getFullList({
          sort: "name",
          requestKey: null,
        });
        setUsers(res);
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    };

    fetchUsers();
  }, []);

  // =========================
  // FETCH ATTENDANCE
  // =========================
  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    try {
      const params = new URLSearchParams();
      if (selectedUser) params.set("user", selectedUser);
      if (selectedDate) params.set("date", selectedDate);
      if (selectedStatus) params.set("status", selectedStatus);
      if (showSuspicious) params.set("suspicious", "true");
      params.set("perPage", "200");

      const token = pb.authStore.token;
      const res = await fetch(`/api/hr/attendance?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(String(json.error || "Gagal memuat absensi."));
      }

      const result = (json.items || []) as AttendanceData[];
      setData(result);
      setLastUpdate(new Date());
    } catch (err: unknown) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.error("❌ ERROR LOADING DATA");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.error("Error:", err);
      if (err instanceof ClientResponseError) {
        console.error("Error message:", err.message);
        console.error("Error data:", err.data);
      } else if (err instanceof Error) {
        console.error("Error message:", err.message);
      }
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedUser, selectedDate, selectedStatus, showSuspicious]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchData(false);
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // =========================
  // STATISTICS
  // =========================
  const stats = {
    total: data.length,
    present: data.filter((d) => d.status === "present").length,
    late: data.filter((d) => d.status === "late").length,
    belumCheckout: data.filter((d) => d.check_in && !d.check_out).length,
    suspicious: data.filter((d) => d.is_suspicious).length,
    avgWorkHours: data.length > 0 
      ? (data.reduce((sum, d) => sum + (d.work_hours || 0), 0) / data.filter(d => d.work_hours > 0).length).toFixed(1)
      : "0",
  };

  const handleExport = async () => {
    try {
      await downloadAttendanceXlsx(
        data.map((item) => ({
          user_name: item.expand?.user?.name || "-",
          date: item.check_in || item.date,
          check_in: item.check_in ?? null,
          has_selfie: item.check_in_selfie ? t("hr.attendance.yes") : t("hr.attendance.no"),
          check_out: item.check_out ?? null,
          status: item.status,
          late_minutes: item.late_minutes || 0,
          work_hours: item.work_hours || 0,
          distance_meter: item.distance_meter ?? "-",
          is_suspicious: item.is_suspicious ? t("hr.attendance.yes") : t("hr.attendance.no"),
        }))
      );
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : t("hr.attendance.exportFailed"));
    }
  };

  // =========================
  // FORMAT HELPERS
  // =========================
  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleTimeString(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(dateLocale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDistance = (meters?: number) => {
    if (meters === undefined) return "-";
    return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(2)}km`;
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      present: t("hr.attendance.statusPresent"),
      late: t("hr.attendance.statusLate"),
      absent: t("hr.attendance.statusAbsent"),
      leave: t("hr.attendance.statusLeave"),
    };
    return map[status] ?? status;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<
      string,
      { bg: string; text: string; icon: typeof CheckCircle }
    > = {
      present: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle },
      late: { bg: "bg-yellow-100", text: "text-yellow-700", icon: Clock },
      absent: { bg: "bg-red-100", text: "text-red-700", icon: XCircle },
      leave: { bg: "bg-blue-100", text: "text-blue-700", icon: Calendar },
    };

    const badge = badges[status] || { bg: "bg-gray-100", text: "text-gray-700", icon: Clock };
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        <Icon className="w-3 h-3" />
        {statusLabel(status)}
      </span>
    );
  };

  // =========================
  // UI
  // =========================
  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t("hr.attendance.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("hr.attendance.lastUpdate", { time: lastUpdate.toLocaleTimeString(dateLocale) })}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
              autoRefresh 
                ? "bg-green-100 text-green-700 hover:bg-green-200" 
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? t("hr.attendance.autoRefreshOn") : t("hr.attendance.autoRefreshOff")}
          </button>

          {/* Manual refresh */}
          <button
            onClick={() => fetchData(false)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {t("hr.attendance.refresh")}
          </button>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            {t("hr.attendance.exportExcel")}
          </button>
        </div>
      </div>

      {/* STATISTICS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t("hr.attendance.statTotal")}</p>
              <p className="text-xl font-bold text-slate-800">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t("hr.attendance.statPresent")}</p>
              <p className="text-xl font-bold text-green-700">{stats.present}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t("hr.attendance.statLate")}</p>
              <p className="text-xl font-bold text-yellow-700">{stats.late}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t("hr.attendance.statNoCheckout")}</p>
              <p className="text-xl font-bold text-orange-700">{stats.belumCheckout}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t("hr.attendance.statSuspicious")}</p>
              <p className="text-xl font-bold text-red-700">{stats.suspicious}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t("hr.attendance.statAvgHours")}</p>
              <p className="text-xl font-bold text-purple-700">{stats.avgWorkHours}h</p>
            </div>
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-600" />
          <h3 className="font-semibold text-slate-800">{t("hr.attendance.filterTitle")}</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">{t("hr.attendance.allEmployees")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">{t("hr.attendance.allStatus")}</option>
            <option value="present">{t("hr.attendance.statusPresent")}</option>
            <option value="late">{t("hr.attendance.statusLate")}</option>
            <option value="absent">{t("hr.attendance.statusAbsent")}</option>
            <option value="leave">{t("hr.attendance.statusLeave")}</option>
          </select>

          <label className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showSuspicious}
              onChange={(e) => setShowSuspicious(e.target.checked)}
              className="rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-700">{t("hr.attendance.onlySuspicious")}</span>
          </label>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => fetchData()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            {t("hr.attendance.applyFilter")}
          </button>
          
          <button
            onClick={() => {
              setSelectedUser("");
              setSelectedDate("");
              setSelectedStatus("");
              setShowSuspicious(false);
            }}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 text-sm font-medium"
          >
            {t("hr.attendance.reset")}
          </button>
        </div>
      </div>

      {/* TABLE */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-500">{t("hr.attendance.loading")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    {t("hr.attendance.colEmployee")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    {t("hr.attendance.colDate")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    {t("hr.attendance.colCheckIn")}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                    {t("hr.attendance.colSelfie")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    {t("hr.attendance.colCheckOut")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    {t("hr.attendance.colStatus")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    {t("hr.attendance.colWorkHours")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    {t("hr.attendance.colDistance")}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                    {t("hr.attendance.colInfo")}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                    Koreksi
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                      <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p>{t("hr.attendance.empty")}</p>
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      {/* NAME */}
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-800">
                            {item.expand?.user?.name || t("hr.attendance.unknown")}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.expand?.user?.email || "-"}
                          </p>
                        </div>
                      </td>

                      {/* DATE */}
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatDate(item.check_in || item.date)}
                      </td>

                      {/* CHECK IN */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">
                          {formatTime(item.check_in)}
                        </p>
                        {item.late_minutes > 0 && (
                          <p className="text-xs text-yellow-600">
                            {t("hr.attendance.lateMinutes", { count: item.late_minutes })}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {item.check_in_selfie ? (
                          <a
                            href={pb.files.getURL(
                              item as unknown as RecordModel,
                              item.check_in_selfie
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                          >
                            <Camera className="h-3.5 w-3.5" aria-hidden />
                            {t("hr.attendance.viewSelfie")}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* CHECK OUT */}
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-800">
                          {formatTime(item.check_out)}
                        </p>
                      </td>

                      {/* STATUS */}
                      <td className="px-4 py-3">
                        {getStatusBadge(item.status)}
                      </td>

                      {/* WORK HOURS */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-700">
                          {item.work_hours > 0 ? `${item.work_hours}h` : "-"}
                        </p>
                      </td>

                      {/* DISTANCE */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <MapPin className="w-3 h-3" />
                          {formatDistance(item.distance_meter)}
                        </div>
                      </td>

                      {/* INFO FLAGS */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {item.is_suspicious && (
                            <div className="relative group">
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                              <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-slate-800 text-white rounded whitespace-nowrap z-10">
                                {t("hr.attendance.suspiciousTooltip")}
                              </span>
                            </div>
                          )}
                          {!item.check_out && item.check_in && (
                            <div className="relative group">
                              <Clock className="w-4 h-4 text-orange-500" />
                              <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-slate-800 text-white rounded whitespace-nowrap z-10">
                                {t("hr.attendance.noCheckoutTooltip")}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setCorrectTarget(item);
                            setCorrectReason("");
                            setCorrectCheckOut("");
                            setCorrectStatus(item.status || "");
                            setCorrectClearOut(false);
                            setCorrectMsg(null);
                          }}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Koreksi
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {correctTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">Koreksi absensi</h3>
            <p className="mt-1 text-sm text-slate-600">
              {correctTarget.expand?.user?.name || correctTarget.user} — {correctTarget.date}
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Alasan (wajib)
              <textarea
                value={correctReason}
                onChange={(e) => setCorrectReason(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Contoh: lupa check-out, koreksi jam pulang"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Status
              <select
                value={correctStatus}
                onChange={(e) => setCorrectStatus(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">(tidak diubah)</option>
                <option value="present">present</option>
                <option value="late">late</option>
                <option value="absent">absent</option>
                <option value="leave">leave</option>
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Check-out baru (opsional)
              <input
                type="datetime-local"
                value={correctCheckOut}
                disabled={correctClearOut}
                onChange={(e) => setCorrectCheckOut(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={correctClearOut}
                onChange={(e) => setCorrectClearOut(e.target.checked)}
              />
              Hapus check-out
            </label>
            {correctMsg && <p className="mt-3 text-sm text-red-600">{correctMsg}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={correctBusy}
                onClick={() => setCorrectTarget(null)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={correctBusy || correctReason.trim().length < 5}
                onClick={() => void submitCorrection()}
                className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {correctBusy ? "Menyimpan…" : "Simpan koreksi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
