"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { getSuspiciousRecords, type AttendanceRecord } from "@/lib/attendance";
import { formatDistance } from "@/lib/gps";
import { AlertTriangle, MapPin, Shield, User, Calendar, Loader2 } from "lucide-react";

type SuspiciousAttendanceRecord = AttendanceRecord & {
  expand?: {
    user?: {
      name?: string;
      email?: string;
    };
  };
};

export default function SuspiciousAttendancePage() {
  const [records, setRecords] = useState<SuspiciousAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const currentUser = pb.authStore.model;
  const hasAccess = !!currentUser && (currentUser.role === "hr" || currentUser.role === "owner");

  // =========================
  // 🔍 FETCH DATA
  // =========================
  const fetchSuspicious = async (pageNum: number) => {
    setLoading(true);
    try {
      const result = await getSuspiciousRecords(pageNum, 50);
      setRecords(result.items as SuspiciousAttendanceRecord[]);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error("Fetch suspicious error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    fetchSuspicious(page);
  }, [page, hasAccess]);

  if (!hasAccess) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          ❌ Akses ditolak. Halaman ini hanya untuk HR dan Owner.
        </div>
      </div>
    );
  }

  // =========================
  // 🎨 FORMAT HELPERS
  // =========================
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("id-ID", {
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

  // =========================
  // ⏳ LOADING
  // =========================
  if (loading && page === 1) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // =========================
  // 🎨 UI
  // =========================
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Shield className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Monitoring Anti-Cheat</h1>
              <p className="text-slate-500 mt-1">Aktivitas mencurigakan yang terdeteksi</p>
            </div>
          </div>
        </div>
      </div>

      {/* WARNING BANNER */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-red-900">Data Sensitif</p>
          <p className="text-sm text-red-700">
            Absensi berikut ditandai mencurigakan oleh sistem. Tinjau dengan teliti sebelum mengambil tindakan.
          </p>
        </div>
      </div>

      {/* SUSPICIOUS INDICATORS */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="font-semibold text-slate-800 mb-3">🚩 Indikator Aktivitas Mencurigakan:</p>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <span className="text-red-500">•</span>
            <span>Device ID berubah dalam 1 hari yang sama</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-500">•</span>
            <span>GPS jump {">"}5km dalam waktu singkat</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-500">•</span>
            <span>Jarak mendekati batas radius secara konsisten</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-500">•</span>
            <span>IP address berubah drastis</span>
          </li>
        </ul>
      </div>

      {/* RECORDS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {records.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-green-300" />
            <p className="text-lg font-medium text-slate-800">✓ Tidak ada aktivitas mencurigakan</p>
            <p className="text-sm text-slate-500 mt-1">Semua absensi terlihat normal</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    Tanggal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    Check In
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    Jarak
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    Device ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    IP Address
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-red-50 transition">
                    {/* USER */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                          <User className="w-4 h-4 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {record.expand?.user?.name || record.expand?.user?.email || "Unknown"}
                          </p>
                          <p className="text-xs text-slate-500">{record.user}</p>
                        </div>
                      </div>
                    </td>

                    {/* DATE */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-700">{formatDate(record.date)}</span>
                      </div>
                    </td>

                    {/* CHECK IN TIME */}
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-800">
                        {record.check_in ? formatTime(record.check_in) : "-"}
                      </p>
                    </td>

                    {/* DISTANCE */}
                    <td className="px-4 py-3">
                      {record.distance_meter !== undefined ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-4 h-4 text-red-500" />
                          <span className="text-sm font-medium text-slate-700">
                            {formatDistance(record.distance_meter)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>

                    {/* DEVICE ID */}
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded">
                        {record.device_id || "-"}
                      </p>
                    </td>

                    {/* IP ADDRESS */}
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono text-slate-600">
                        {record.ip_address || "-"}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Halaman {page} dari {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sebelumnya
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
