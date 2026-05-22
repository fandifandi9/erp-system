"use client";

import { pb } from "@/lib/pocketbase";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, TrendingUp, Clock, AlertTriangle, Calendar, MapPin, Moon, Navigation } from "lucide-react";
import { MissedCheckoutReminderBanner } from "@/components/MissedCheckoutReminderBanner";

export default function HRPage() {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    todayPresent: 0,
    todayLate: 0,
    onLeave: 0,
    suspicious: 0,
    totalOffices: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    loadStats();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
      setLastUpdate(new Date());
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      // Get today's date range for filtering
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      // Query using attendance_logs collection with proper date filtering
      const presentResult = await pb.collection("attendance_logs").getList(1, 1, {
        filter: `status="present" && created >= "${start.toISOString()}" && created <= "${end.toISOString()}"`,
        requestKey: null,
      });

      const lateResult = await pb.collection("attendance_logs").getList(1, 1, {
        filter: `status="late" && created >= "${start.toISOString()}" && created <= "${end.toISOString()}"`,
        requestKey: null,
      });

      const suspiciousResult = await pb.collection("attendance_logs").getList(1, 1, {
        filter: "is_suspicious=true",
        requestKey: null,
      });

      const todayStr = now.toISOString().split("T")[0];
      const leaveResult = await pb.collection("leave_requests").getList(1, 1, {
        filter: `status="approved" && date="${todayStr}"`,
        requestKey: null,
      });

      const officesResult = await pb.collection("offices").getList(1, 1, {
        requestKey: null,
      });

      const usersResult = await pb.collection("users").getList(1, 1, {
        requestKey: null,
      });

      setStats({
        totalEmployees: usersResult.totalItems,
        todayPresent: presentResult.totalItems,
        todayLate: lateResult.totalItems,
        onLeave: leaveResult.totalItems,
        suspicious: suspiciousResult.totalItems,
        totalOffices: officesResult.totalItems,
      });

    } catch (error) {
      console.error("Load stats error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-32 bg-slate-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Dashboard HR</h1>
        <p className="text-slate-500 mt-1">Ringkasan data kehadiran & karyawan</p>
        <p className="text-xs text-slate-400 mt-1">
          Terakhir diperbarui: {lastUpdate.toLocaleTimeString("id-ID")} (auto-refresh setiap 30 detik)
        </p>
      </div>

      <MissedCheckoutReminderBanner />

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Employees */}
        <Link href="/hr/employees">
          <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-indigo-100 rounded-lg">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-sm text-slate-500 mb-1">Total Karyawan</p>
            <p className="text-3xl font-bold text-slate-800">{stats.totalEmployees}</p>
          </div>
        </Link>

        {/* Today Present */}
        <Link href="/hr/attendance">
          <div className="bg-green-50 rounded-xl border border-green-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Clock className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <p className="text-sm text-green-600 mb-1">Hadir Hari Ini</p>
            <p className="text-3xl font-bold text-green-700">{stats.todayPresent}</p>
          </div>
        </Link>

        {/* Today Late */}
        <Link href="/hr/attendance">
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
            <p className="text-sm text-yellow-600 mb-1">Terlambat Hari Ini</p>
            <p className="text-3xl font-bold text-yellow-700">{stats.todayLate}</p>
          </div>
        </Link>

        {/* On Leave */}
        <Link href="/hr/leave">
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-sm text-blue-600 mb-1">Cuti Hari Ini</p>
            <p className="text-3xl font-bold text-blue-700">{stats.onLeave}</p>
          </div>
        </Link>

        {/* Suspicious */}
        <Link href="/hr/attendance/suspicious">
          <div className="bg-red-50 rounded-xl border border-red-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <p className="text-sm text-red-600 mb-1">Aktivitas Mencurigakan</p>
            <p className="text-3xl font-bold text-red-700">{stats.suspicious}</p>
          </div>
        </Link>

        {/* Total Offices */}
        <Link href="/hr/offices">
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <MapPin className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <p className="text-sm text-purple-600 mb-1">Total Kantor</p>
            <p className="text-3xl font-bold text-purple-700">{stats.totalOffices}</p>
          </div>
        </Link>
      </div>

      {/* QUICK ACTIONS */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <Link
            href="/hr/employees"
            className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-center font-medium"
          >
            Kelola Karyawan
          </Link>
          <Link
            href="/hr/attendance"
            className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-center font-medium"
          >
            Lihat Absensi
          </Link>
          <Link
            href="/hr/leave"
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-center font-medium"
          >
            Kelola Cuti
          </Link>
          <Link
            href="/hr/overtime"
            className="px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-center font-medium inline-flex items-center justify-center gap-2"
          >
            <Moon className="w-4 h-4" />
            Lembur
          </Link>
          <Link
            href="/hr/field-activity"
            className="px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition text-center font-medium inline-flex items-center justify-center gap-2"
          >
            <Navigation className="w-4 h-4" />
            Aktivitas luar
          </Link>
          <Link
            href="/hr/offices"
            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-center font-medium"
          >
            Pengaturan GPS
          </Link>
        </div>
      </div>

      {/* INFO */}
      <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800 mb-2">📊 Dashboard Information</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Data diperbarui secara real-time</li>
          <li>Statistik menampilkan data hari ini</li>
          <li>Klik pada card untuk melihat detail lengkap</li>
          <li>
            Audit selfie: di <strong className="text-slate-800">Kelola Karyawan</strong> → detail pegawai → centang{" "}
            <em>Wajibkan foto selfie saat check-in</em> (field <code className="rounded bg-slate-100 px-0.5">profiles.require_checkin_selfie</code>
            ). Owner dan HR bisa mengubahnya sesuai akses PocketBase.
          </li>
        </ul>
      </div>
    </div>
  );
}
