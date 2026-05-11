"use client";

import { useEffect, useState, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import { 
  checkIn, 
  checkOut, 
  getTodayAttendance,
  getUserProfile,
  type AttendanceRecord,
  type Office,
} from "@/lib/attendance";
import { formatDistance } from "@/lib/gps";
import { MapPin, Clock, AlertTriangle, CheckCircle, LogOut, Loader2 } from "lucide-react";

export default function AttendancePage() {
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [officeInfo, setOfficeInfo] = useState<Office | null>(null);
  const radius = officeInfo?.radius || 100;

  const currentUser = pb.authStore.model;

  // =========================
  // 🔍 LOAD DATA
  // =========================
  const loadData = useCallback(async () => {
    if (!currentUser) return;

    try {
      // Load today's attendance
      const record = await getTodayAttendance(currentUser.id);
      setTodayRecord(record);

      // Load office info
      const { office } = await getUserProfile(currentUser.id);
      setOfficeInfo(office);
    } catch (err) {
      console.error("Load data error:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // =========================
  // ✅ HANDLE CHECK-IN
  // =========================
  const handleCheckIn = async () => {
    if (!currentUser || processing) return;

    setProcessing(true);
    setError("");
    setSuccess("");

    try {
      const result = await checkIn(currentUser.id);

      if (result.success) {
        setSuccess(result.message);
        setTodayRecord(result.data || null);
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to check in";
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  // =========================
  // 🔵 HANDLE CHECK-OUT
  // =========================
  const handleCheckOut = async () => {
    if (!currentUser || processing) return;

    setProcessing(true);
    setError("");
    setSuccess("");

    try {
      const result = await checkOut(currentUser.id);

      if (result.success) {
        setSuccess(result.message);
        setTodayRecord(result.data || null);
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to check out";
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  // =========================
  // 🎨 FORMAT HELPERS
  // =========================
  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = () => {
    return new Date().toLocaleDateString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusBadge = (status?: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      present: { bg: "bg-green-100", text: "text-green-700", label: "✓ Hadir" },
      late: { bg: "bg-yellow-100", text: "text-yellow-700", label: "⚠ Terlambat" },
      absent: { bg: "bg-red-100", text: "text-red-700", label: "✗ Tidak Hadir" },
      leave: { bg: "bg-blue-100", text: "text-blue-700", label: "🏖 Cuti" },
    };

    const badge = badges[status || ""] || { bg: "bg-gray-100", text: "text-gray-700", label: "-" };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  // =========================
  // ⏳ LOADING
  // =========================
  if (loading) {
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Absensi</h1>
        <p className="text-slate-500 mt-1 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {formatDate()}
        </p>
      </div>

      {/* ERROR/SUCCESS ALERTS */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Gagal</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-start gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Berhasil!</p>
            <p className="text-sm">{success}</p>
          </div>
        </div>
      )}

      {/* OFFICE INFO */}
      {officeInfo && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
          <MapPin className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-indigo-900">{officeInfo.name}</p>
            <p className="text-xs text-indigo-600">
              Radius: {formatDistance(radius)}
            </p>
          </div>
        </div>
      )}

      {/* STATUS CARD */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Status Hari Ini</h2>
          {getStatusBadge(todayRecord?.status)}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* CHECK IN */}
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Check In</p>
            <p className="text-2xl font-bold text-slate-800">
              {formatTime(todayRecord?.check_in)}
            </p>
            {todayRecord?.late_minutes && todayRecord.late_minutes > 0 && (
              <p className="text-xs text-yellow-600 mt-1">
                Terlambat {todayRecord.late_minutes} menit
              </p>
            )}
          </div>

          {/* CHECK OUT */}
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Check Out</p>
            <p className="text-2xl font-bold text-slate-800">
              {formatTime(todayRecord?.check_out)}
            </p>
            {todayRecord?.work_hours && todayRecord.work_hours > 0 && (
              <p className="text-xs text-green-600 mt-1">
                Jam kerja: {todayRecord.work_hours}h
              </p>
            )}
          </div>
        </div>

        {/* GPS INFO */}
        {todayRecord?.distance_meter !== undefined && (
          <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
            📍 Jarak dari kantor: {formatDistance(todayRecord.distance_meter)}
          </div>
        )}

        {/* SUSPICIOUS WARNING */}
        {todayRecord?.is_suspicious && (
          <div className="bg-red-50 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>Aktivitas mencurigakan terdeteksi. HR akan meninjau absensi Anda.</p>
          </div>
        )}
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex gap-3">
        <button
          onClick={handleCheckIn}
          disabled={processing || !!todayRecord?.check_in}
          className={`flex-1 py-4 rounded-xl font-semibold text-white transition flex items-center justify-center gap-2 ${
            processing || todayRecord?.check_in
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700 active:scale-95"
          }`}
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              Check In
            </>
          )}
        </button>

        <button
          onClick={handleCheckOut}
          disabled={processing || !todayRecord?.check_in || !!todayRecord?.check_out}
          className={`flex-1 py-4 rounded-xl font-semibold text-white transition flex items-center justify-center gap-2 ${
            processing || !todayRecord?.check_in || todayRecord?.check_out
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 active:scale-95"
          }`}
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <LogOut className="w-5 h-5" />
              Check Out
            </>
          )}
        </button>
      </div>

      {/* HELP INFO */}
      <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-2">
        <p className="font-medium text-slate-800">📋 Catatan Penting:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Pastikan GPS aktif dan izin lokasi diberikan</li>
          <li>Check-in hanya bisa dilakukan di area kantor</li>
          <li>Check-out otomatis menghitung jam kerja</li>
          <li>Hubungi HR jika ada kendala</li>
        </ul>
      </div>
    </div>
  );
}
