"use client";

import { useEffect, useState, useCallback } from "react";
import type { RecordModel } from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { pb } from "@/lib/pocketbase";
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
  Loader2
} from "lucide-react";

interface AttendanceData {
  id: string;
  user: string;
  date: string;
  check_in?: string;
  check_out?: string;
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
}

export default function HRAttendancePage() {
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
      const filters = [];

      if (selectedUser) {
        filters.push(`user="${selectedUser}"`);
      }

      if (selectedDate) {
        const start = `${selectedDate} 00:00:00`;
        const end = `${selectedDate} 23:59:59`;
        filters.push(`created >= "${start}" && created <= "${end}"`);
      }

      if (selectedStatus) {
        filters.push(`status="${selectedStatus}"`);
      }

      if (showSuspicious) {
        filters.push(`is_suspicious=true`);
      }

      const filter = filters.length > 0 ? filters.join(" && ") : "";

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 FETCHING ATTENDANCE DATA");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Filter:", filter || "NO FILTER (load all)");
      console.log("Collection: attendance_logs");
      console.log("Sort: -created");
      console.log("Expand: user");

      const result = await pb.collection("attendance_logs").getFullList({
        sort: "-created",
        expand: "user",
        filter: filter || undefined,
      });

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅ DATA LOADED SUCCESSFULLY");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Total records:", result.length);
      console.log("First record:", result[0]);
      console.log("Raw data:", result);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      setData(result as unknown as AttendanceData[]);
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

  // =========================
  // EXPORT TO CSV
  // =========================
  const handleExport = () => {
    const csvContent = [
      ["Nama", "Tanggal", "Check In", "Check Out", "Status", "Terlambat (menit)", "Jam Kerja", "Jarak (m)", "Mencurigakan"],
      ...data.map(item => [
        item.expand?.user?.name || "-",
        new Date(item.check_in || item.date).toLocaleDateString("id-ID"),
        item.check_in ? new Date(item.check_in).toLocaleTimeString("id-ID") : "-",
        item.check_out ? new Date(item.check_out).toLocaleTimeString("id-ID") : "-",
        item.status,
        item.late_minutes || 0,
        item.work_hours || 0,
        item.distance_meter || "-",
        item.is_suspicious ? "Ya" : "Tidak",
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // =========================
  // FORMAT HELPERS
  // =========================
  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDistance = (meters?: number) => {
    if (meters === undefined) return "-";
    return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(2)}km`;
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
        {status}
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
          <h1 className="text-2xl font-bold text-slate-800">Monitoring Absensi Karyawan</h1>
          <p className="text-sm text-slate-500 mt-1">
            Terakhir diperbarui: {lastUpdate.toLocaleTimeString("id-ID")}
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
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </button>

          {/* Manual refresh */}
          <button
            onClick={() => fetchData(false)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export CSV
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
              <p className="text-xs text-slate-500">Total</p>
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
              <p className="text-xs text-slate-500">Hadir</p>
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
              <p className="text-xs text-slate-500">Terlambat</p>
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
              <p className="text-xs text-slate-500">Belum Checkout</p>
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
              <p className="text-xs text-slate-500">Mencurigakan</p>
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
              <p className="text-xs text-slate-500">Rata-rata Jam</p>
              <p className="text-xl font-bold text-purple-700">{stats.avgWorkHours}h</p>
            </div>
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Filter Data</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Semua Karyawan</option>
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
            <option value="">Semua Status</option>
            <option value="present">Hadir</option>
            <option value="late">Terlambat</option>
            <option value="absent">Tidak Hadir</option>
            <option value="leave">Cuti</option>
          </select>

          <label className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showSuspicious}
              onChange={(e) => setShowSuspicious(e.target.checked)}
              className="rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-700">Hanya Mencurigakan</span>
          </label>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => fetchData()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Terapkan Filter
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
            Reset
          </button>
        </div>
      </div>

      {/* TABLE */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-500">Memuat data...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Karyawan
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Tanggal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Check In
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Check Out
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Jam Kerja
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Jarak
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                    Info
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p>Tidak ada data absensi</p>
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      {/* NAME */}
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-800">
                            {item.expand?.user?.name || "Unknown"}
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
                            +{item.late_minutes} menit
                          </p>
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
                                Aktivitas Mencurigakan
                              </span>
                            </div>
                          )}
                          {!item.check_out && item.check_in && (
                            <div className="relative group">
                              <Clock className="w-4 h-4 text-orange-500" />
                              <span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-slate-800 text-white rounded whitespace-nowrap z-10">
                                Belum Check Out
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
