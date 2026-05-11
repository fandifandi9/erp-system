"use client";

import { useEffect, useState, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import { getAttendanceHistory, type AttendanceRecord } from "@/lib/attendance";
import { formatDistance } from "@/lib/gps";
import { Calendar, Clock, MapPin, AlertTriangle, TrendingUp, Loader2 } from "lucide-react";

/** Riwayat absensi pemakai yang login (dipakai /attendance/history dan dashboard staff). */
export default function AttendanceHistoryUserView() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [currentUserId, setCurrentUserId] = useState<string>(() => pb.authStore.model?.id ?? "");
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setCurrentUserId(pb.authStore.model?.id ?? "");
      setAuthReady(true);
    };
    sync();
    const unsub = pb.authStore.onChange(sync);
    return unsub;
  }, []);

  const fetchHistory = useCallback(
    async (pageNum: number) => {
      if (!currentUserId) {
        setRecords([]);
        setTotalPages(1);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const result = await getAttendanceHistory(currentUserId, pageNum, 30);
        setRecords(result.items);
        setTotalPages(result.totalPages);
      } catch (err) {
        console.error("Fetch history error:", err);
      } finally {
        setLoading(false);
      }
    },
    [currentUserId]
  );

  useEffect(() => {
    void fetchHistory(page);
  }, [page, fetchHistory]);

  const calculateStats = () => {
    const total = records.length;
    const present = records.filter((r) => r.status === "present").length;
    const late = records.filter((r) => r.status === "late").length;
    const absent = records.filter((r) => r.status === "absent").length;
    const totalWorkHours = records.reduce((sum, r) => sum + (r.work_hours || 0), 0);

    return { total, present, late, absent, totalWorkHours };
  };

  const stats = calculateStats();

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      present: { bg: "bg-green-100", text: "text-green-700", label: "Hadir" },
      late: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Terlambat" },
      absent: { bg: "bg-red-100", text: "text-red-700", label: "Tidak Hadir" },
      leave: { bg: "bg-blue-100", text: "text-blue-700", label: "Cuti" },
    };

    const badge = badges[status] || { bg: "bg-gray-100", text: "text-gray-700", label: status };

    return (
      <span className={`rounded-full px-2 py-1 text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  if (!authReady) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!currentUserId) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">
          Sesi belum siap atau Anda belum login. Muat ulang halaman atau buka lagi dari dashboard.
        </div>
      </div>
    );
  }

  if (loading && page === 1) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Riwayat Absensi</h1>
        <p className="mt-1 text-slate-500">Data kehadiran Anda dari log absensi.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-slate-500">Total Hari (halaman ini)</p>
            <Calendar className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
        </div>

        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-green-600">Hadir</p>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-green-700">{stats.present}</p>
        </div>

        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-yellow-600">Terlambat</p>
            <Clock className="h-4 w-4 text-yellow-500" />
          </div>
          <p className="text-2xl font-bold text-yellow-700">{stats.late}</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-blue-600">Total Jam Kerja</p>
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-blue-700">{stats.totalWorkHours.toFixed(1)}h</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">
                  Check In
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">
                  Check Out
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">
                  Jam Kerja
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">Jarak</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <Calendar className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                    <p>Belum ada riwayat absensi</p>
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <span className="text-sm text-slate-700">{formatDate(record.date)}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <p className="font-medium text-slate-800">
                          {record.check_in ? formatTime(record.check_in) : "-"}
                        </p>
                        {record.late_minutes > 0 && (
                          <p className="text-xs text-yellow-600">+{record.late_minutes} menit</p>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-800">
                        {record.check_out ? formatTime(record.check_out) : "-"}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(record.status)}
                        {record.is_suspicious && (
                          <div className="group relative">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white group-hover:block">
                              Mencurigakan
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-700">
                        {record.work_hours > 0 ? `${record.work_hours}h` : "-"}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      {record.distance_meter !== undefined ? (
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <MapPin className="h-3 w-3" />
                          {formatDistance(record.distance_meter)}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-600">
              Halaman {page} dari {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
