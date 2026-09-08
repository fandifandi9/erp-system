"use client";

import { pb } from "@/lib/pocketbase";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, TrendingUp, Clock, AlertTriangle, Calendar, MapPin, Moon, Navigation } from "lucide-react";
import { HrRatingShortcutCard } from "@/components/hr/HrRatingShortcutCard";
import { MissedCheckoutReminderBanner } from "@/components/MissedCheckoutReminderBanner";
import { useLocale } from "@/components/LocaleProvider";

export default function HRPage() {
  const { t, locale } = useLocale();
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

  const dateLocale = locale === "en" ? "en-US" : "id-ID";

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
      setLastUpdate(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);

      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

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
      <div>
        <h1 className="text-3xl font-bold text-slate-800">{t("hr.dashboard.title")}</h1>
        <p className="text-slate-500 mt-1">{t("hr.dashboard.subtitle")}</p>
        <p className="text-xs text-slate-400 mt-1">
          {t("hr.dashboard.lastUpdate", { time: lastUpdate.toLocaleTimeString(dateLocale) })}
        </p>
      </div>

      <MissedCheckoutReminderBanner />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/hr/employees">
          <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-indigo-100 rounded-lg">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-sm text-slate-500 mb-1">{t("hr.dashboard.statEmployees")}</p>
            <p className="text-3xl font-bold text-slate-800">{stats.totalEmployees}</p>
          </div>
        </Link>

        <Link href="/hr/attendance">
          <div className="bg-green-50 rounded-xl border border-green-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Clock className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <p className="text-sm text-green-600 mb-1">{t("hr.dashboard.statPresent")}</p>
            <p className="text-3xl font-bold text-green-700">{stats.todayPresent}</p>
          </div>
        </Link>

        <Link href="/hr/attendance">
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
            <p className="text-sm text-yellow-600 mb-1">{t("hr.dashboard.statLate")}</p>
            <p className="text-3xl font-bold text-yellow-700">{stats.todayLate}</p>
          </div>
        </Link>

        <Link href="/hr/leave">
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-sm text-blue-600 mb-1">{t("hr.dashboard.statOnLeave")}</p>
            <p className="text-3xl font-bold text-blue-700">{stats.onLeave}</p>
          </div>
        </Link>

        <Link href="/hr/attendance/suspicious">
          <div className="bg-red-50 rounded-xl border border-red-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <p className="text-sm text-red-600 mb-1">{t("hr.dashboard.statSuspicious")}</p>
            <p className="text-3xl font-bold text-red-700">{stats.suspicious}</p>
          </div>
        </Link>

        <Link href="/hr/offices">
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <MapPin className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <p className="text-sm text-purple-600 mb-1">{t("hr.dashboard.statOffices")}</p>
            <p className="text-3xl font-bold text-purple-700">{stats.totalOffices}</p>
          </div>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">{t("hr.dashboard.quickActions")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <Link
            href="/hr/employees"
            className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-center font-medium"
          >
            {t("hr.dashboard.manageEmployees")}
          </Link>
          <Link
            href="/hr/attendance"
            className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-center font-medium"
          >
            {t("hr.dashboard.viewAttendance")}
          </Link>
          <Link
            href="/hr/leave"
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-center font-medium"
          >
            {t("hr.dashboard.manageLeave")}
          </Link>
          <Link
            href="/hr/overtime"
            className="px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-center font-medium inline-flex items-center justify-center gap-2"
          >
            <Moon className="w-4 h-4" />
            {t("hr.dashboard.overtime")}
          </Link>
          <Link
            href="/hr/field-activity"
            className="px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition text-center font-medium inline-flex items-center justify-center gap-2"
          >
            <Navigation className="w-4 h-4" />
            {t("hr.dashboard.fieldActivity")}
          </Link>
          <Link
            href="/hr/offices"
            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-center font-medium"
          >
            {t("hr.dashboard.gpsSettings")}
          </Link>
        </div>
      </div>

      <HrRatingShortcutCard />

      <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800 mb-2">{t("hr.dashboard.infoTitle")}</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>{t("hr.dashboard.infoRealtime")}</li>
          <li>{t("hr.dashboard.infoToday")}</li>
          <li>{t("hr.dashboard.infoClickCard")}</li>
          <li>{t("hr.dashboard.infoSelfie")}</li>
        </ul>
      </div>
    </div>
  );
}
