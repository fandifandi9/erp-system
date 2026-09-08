"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { getSuspiciousRecords, type AttendanceRecord } from "@/lib/attendance";
import { formatDistance } from "@/lib/gps";
import { AlertTriangle, MapPin, Shield, User, Calendar, Loader2 } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

type SuspiciousAttendanceRecord = AttendanceRecord & {
  expand?: {
    user?: {
      name?: string;
      email?: string;
    };
  };
};

export default function SuspiciousAttendancePage() {
  const { t, locale } = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "id-ID";
  const [records, setRecords] = useState<SuspiciousAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const currentUser = pb.authStore.model;
  const hasAccess = !!currentUser && (currentUser.role === "hr" || currentUser.role === "owner");

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
    void fetchSuspicious(page);
  }, [page, hasAccess]);

  if (!hasAccess) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {t("hr.common.accessDeniedHrOwner")}
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(dateLocale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
    });

  if (loading && page === 1) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-red-100 p-2">
            <Shield className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">{t("hr.attendance.suspicious.title")}</h1>
            <p className="mt-1 text-slate-500">{t("hr.attendance.suspicious.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="flex-1">
          <p className="font-medium text-red-900">{t("hr.attendance.suspicious.sensitiveTitle")}</p>
          <p className="text-sm text-red-700">{t("hr.attendance.suspicious.sensitiveDesc")}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 font-semibold text-slate-800">{t("hr.attendance.suspicious.indicatorsTitle")}</p>
        <ul className="grid grid-cols-1 gap-2 text-sm text-slate-600 md:grid-cols-2">
          <li className="flex items-start gap-2">
            <span className="text-red-500">•</span>
            <span>{t("hr.attendance.suspicious.indicator1")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-500">•</span>
            <span>{t("hr.attendance.suspicious.indicator2")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-500">•</span>
            <span>{t("hr.attendance.suspicious.indicator3")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-500">•</span>
            <span>{t("hr.attendance.suspicious.indicator4")}</span>
          </li>
        </ul>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {records.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <p className="text-lg font-medium text-slate-800">{t("hr.attendance.suspicious.emptyTitle")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("hr.attendance.suspicious.emptyDesc")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">
                    {t("hr.attendance.suspicious.colUser")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">
                    {t("hr.attendance.suspicious.colDate")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">
                    {t("hr.attendance.suspicious.colCheckIn")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">
                    {t("hr.attendance.suspicious.colDistance")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">
                    {t("hr.attendance.suspicious.colDevice")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-600">
                    {t("hr.attendance.suspicious.colIp")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record) => (
                  <tr key={record.id} className="transition hover:bg-red-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200">
                          <User className="h-4 w-4 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {record.expand?.user?.name || record.expand?.user?.email || t("hr.attendance.unknown")}
                          </p>
                          <p className="text-xs text-slate-500">{record.user}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <span className="text-sm text-slate-700">{formatDate(record.date)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-800">
                        {record.check_in ? formatTime(record.check_in) : "-"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {record.distance_meter !== undefined ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-red-500" />
                          <span className="text-sm font-medium text-slate-700">
                            {formatDistance(record.distance_meter)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600">
                        {record.device_id || "-"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-slate-600">{record.ip_address || "-"}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-600">
              {t("hr.attendance.suspicious.pageOf", { page, total: totalPages })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("hr.attendance.suspicious.prev")}
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("hr.attendance.suspicious.next")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
