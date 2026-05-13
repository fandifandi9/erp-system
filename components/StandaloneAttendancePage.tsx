"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { 
  checkIn, 
  checkOut, 
  getTodayAttendance,
  getUserProfile,
  type AttendanceRecord,
  type Office,
} from "@/lib/attendance";
import { checkProfileComplete } from "@/lib/profile";
import { formatDistance } from "@/lib/gps";
import Link from "next/link";
import { canAccess, getOperationalDashboardRoute } from "@/lib/rbac";
import StandaloneAppHeader from "@/components/StandaloneAppHeader";
import { StandalonePortalActions } from "@/components/StandalonePortalActions";
import {
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle,
  LogOut,
  Loader2,
  AlertCircle,
  History,
  Navigation,
  Calendar,
} from "lucide-react";

export default function StandaloneAttendancePage() {
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [officeInfo, setOfficeInfo] = useState<Office | null>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const [currentUserId, setCurrentUserId] = useState<string>(() => pb.authStore.model?.id ?? "");
  const [sessionUser, setSessionUser] = useState<Record<string, unknown> | null>(
    () => (pb.authStore.model as Record<string, unknown> | null) ?? null
  );
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const m = pb.authStore.model as Record<string, unknown> | null;
      setCurrentUserId(pb.authStore.model?.id ?? "");
      setSessionUser(m ?? null);
      setAuthReady(true);
    };
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  /** Logo header: ke Profil bila bisa, supaya di PWA ada jalan keluar dari layar absensi. */
  const headerHomeHref = useMemo(() => {
    if (sessionUser && canAccess(sessionUser, "/profile")) return "/profile";
    if (sessionUser) return "/attendance";
    return "/attendance";
  }, [sessionUser]);

  const portalEnd = <StandalonePortalActions showLogout />;

  // =========================
  // 🔍 LOAD DATA
  // =========================
  const loadData = useCallback(async () => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    try {
      // Check profile completion first
      const profileCheck = await checkProfileComplete(currentUserId);
      
      if (!profileCheck.isComplete) {
        setProfileIncomplete(true);
        setProfileMessage(profileCheck.message);
        setLoading(false);
        return; // Stop here if profile incomplete
      }

      // Load today's attendance
      const record = await getTodayAttendance(currentUserId);
      setTodayRecord(record);

      // Load office info
      const { office } = await getUserProfile(currentUserId);
      setOfficeInfo(office);
    } catch (err) {
      console.error("Load data error:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh ringan: 60 detik, jeda saat tab tidak terlihat (kurangi beban & error jaringan)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadData();
      setLastUpdate(new Date());
    };
    const start = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(tick, 60000);
    };
    start();
    const onVisibility = () => {
      if (!document.hidden) {
        void loadData();
        setLastUpdate(new Date());
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (interval) clearInterval(interval);
    };
  }, [loadData]);

  // =========================
  // ✅ HANDLE CHECK-IN
  // =========================
  const handleCheckIn = async () => {
    if (!currentUserId || processing) return;

    // Block if profile incomplete
    if (profileIncomplete) {
      setError(profileMessage);
      return;
    }

    setProcessing(true);
    setError("");
    setSuccess("");

    try {
      const result = await checkIn(currentUserId);

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
    if (!currentUserId || processing) return;

    // Block if profile incomplete
    if (profileIncomplete) {
      setError(profileMessage);
      return;
    }

    setProcessing(true);
    setError("");
    setSuccess("");

    try {
      const result = await checkOut(currentUserId);

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
  if (!authReady) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-slate-50">
        <StandaloneAppHeader subtitle="Absensi" homeHref={headerHomeHref} endSlot={portalEnd} />
        <div className="flex min-h-[50dvh] items-center justify-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  // =========================
  // 🚫 PROFILE INCOMPLETE BLOCK
  // =========================
  if (profileIncomplete) {
    const showProfileLink = Boolean(sessionUser && canAccess(sessionUser, "/profile"));
    const dashboardEscapeHref = sessionUser ? getOperationalDashboardRoute(sessionUser) : null;

    return (
      <div className="min-h-[100dvh] bg-slate-50">
        <StandaloneAppHeader subtitle="Absensi" homeHref={headerHomeHref} endSlot={portalEnd} />

        <div className="mx-auto max-w-4xl space-y-6 p-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Absensi</h1>
            <p className="mt-1 text-slate-500">Sistem Absensi GPS</p>
            <p className="mt-2 text-sm text-slate-600">
              Gunakan menu di atas (logo ke halaman utama, Profil, Dashboard) atau tombol{" "}
              <span className="font-medium text-slate-800">Keluar</span> untuk keluar akun di mode PWA.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-8 text-center">
            <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
            <h2 className="mb-2 text-2xl font-bold text-red-800">Data HR Belum Lengkap</h2>
            <p className="mb-4 text-red-700">{profileMessage}</p>
            <div className="rounded-xl bg-white p-4 text-left">
              <p className="mb-2 font-semibold text-slate-800">Silakan hubungi HR untuk melengkapi:</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
                <li>Jabatan</li>
                <li>Departemen</li>
                <li>Gaji pokok</li>
              </ul>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {showProfileLink && (
                <Link
                  href="/profile"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Buka profil
                </Link>
              )}
              {dashboardEscapeHref && (
                <Link
                  href={dashboardEscapeHref}
                  className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm hover:bg-indigo-100"
                >
                  Ke dashboard
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUserId) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          Silakan login terlebih dahulu.
        </div>
      </div>
    );
  }

  // =========================
  // 🎨 UI
  // =========================
  const showFieldActivityLink =
    Boolean(sessionUser) && canAccess(sessionUser!, "/attendance/field-activity");

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <StandaloneAppHeader subtitle="Absensi" homeHref={headerHomeHref} endSlot={portalEnd} />

      <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Absensi</h1>
          <p className="mt-1 flex items-center gap-2 text-slate-600">
            <Clock className="h-4 w-4 shrink-0" />
            {formatDate()}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Terakhir diperbarui: {lastUpdate.toLocaleTimeString("id-ID")} (pembaruan otomatis ±1 menit saat tab aktif)
          </p>
        </div>
      </div>

      <nav
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-4 text-sm font-medium"
        aria-label="Menu terkait absensi"
      >
        <Link
          href="/attendance/history"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm hover:bg-slate-50"
        >
          <History className="h-4 w-4 shrink-0" aria-hidden />
          Riwayat
        </Link>
        {sessionUser && canAccess(sessionUser, "/attendance/field-activity") && (
          <Link
            href="/attendance/field-activity"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm hover:bg-slate-50"
          >
            <Navigation className="h-4 w-4 shrink-0" aria-hidden />
            Aktivitas luar
          </Link>
        )}
        {sessionUser && canAccess(sessionUser, "/attendance/leave") && (
          <Link
            href="/attendance/leave"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm hover:bg-slate-50"
          >
            <Calendar className="h-4 w-4 shrink-0" aria-hidden />
            Cuti (booking)
          </Link>
        )}
      </nav>

      <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">Aktivitas di luar kantor (meeting, kunjungan, dinas luar)?</p>
        <p className="mt-1 text-amber-900/90">
          Ajukan lebih dulu dan tunggu ACC HR — setelah disetujui, check-in di luar zona GPS diizinkan pada tanggal yang dicakup.
        </p>
        {showFieldActivityLink ? (
          <Link
            href="/attendance/field-activity"
            className="mt-2 inline-flex items-center gap-1.5 font-semibold text-amber-950 underline-offset-2 hover:underline"
          >
            <Navigation className="h-4 w-4 shrink-0" />
            Pengajuan aktivitas luar kantor
          </Link>
        ) : (
          <p className="mt-2 text-xs text-amber-900/80">
            Pengajuan aktivitas luar tersedia untuk akun yang memiliki akses halaman ini (biasanya semua karyawan).
          </p>
        )}
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
              Radius: {formatDistance(officeInfo.radius || 100)}
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
    </div>
  );
}
