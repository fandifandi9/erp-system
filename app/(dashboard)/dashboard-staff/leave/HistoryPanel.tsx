"use client";

import { useEffect, useState, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import {
  getLeaveHistory,
  formatDateRange,
  calculateDays,
  cancelLeaveRequest,
  canStaffCancelLeaveLocally,
  calendarDaysFromTodayUntilLeaveStart,
  formatLeaveHrActionSummary,
  type LeaveRequest,
} from "@/lib/leave";
import { useRouter } from "next/navigation";
import { Calendar, Clock, Loader2, Plus, XCircle, CheckCircle, AlertTriangle, Building2 } from "lucide-react";

export function StaffLeaveHistoryPanel({
  omitPageHeader = false,
  basePath = "/dashboard-staff/leave",
}: {
  omitPageHeader?: boolean;
  basePath?: string;
}) {
  const router = useRouter();
  const currentUserId = pb.authStore.model?.id ?? "";

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!currentUserId) return;

    setLoading(true);
    try {
      const result = await getLeaveHistory(currentUserId, page, 10);
      setRequests(result.items);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error("Failed to load leave history:", error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, page]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleCancelBooking = async (requestId: string) => {
    if (!confirm("Yakin ingin membatalkan booking cuti ini?")) return;

    setCancelling(requestId);
    try {
      const result = await cancelLeaveRequest(requestId);
      if (result.success) {
        alert(result.message);
        loadHistory();
      } else {
        alert(result.message);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Gagal membatalkan booking";
      alert(message);
    } finally {
      setCancelling(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: {
        bg: "bg-amber-100",
        text: "text-amber-800",
        label: "Menunggu HR",
        icon: AlertTriangle,
      },
      approved: {
        bg: "bg-green-100",
        text: "text-green-700",
        label: "✓ Disetujui",
        icon: CheckCircle,
      },
      rejected: {
        bg: "bg-red-50",
        text: "text-red-700",
        label: "Ditolak HR",
        icon: XCircle,
      },
      cancelled: {
        bg: "bg-gray-100",
        text: "text-gray-700",
        label: "✗ Dibatalkan",
        icon: XCircle,
      },
    };

    const badge = badges[status as keyof typeof badges] || {
      bg: "bg-gray-100",
      text: "text-gray-700",
      label: status,
      icon: AlertTriangle,
    };

    const Icon = badge.icon;

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${badge.bg} ${badge.text}`}
      >
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    );
  };

  const canCancel = (request: LeaveRequest) => {
    if (request.status === "cancelled" || request.status === "rejected") {
      return false;
    }
    if (request.status !== "pending" && request.status !== "approved") {
      return false;
    }
    return canStaffCancelLeaveLocally(request.status, request.start_date);
  };

  if (loading && page === 1) {
    return (
      <div className="flex min-h-[400px] items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const wrap = omitPageHeader ? "space-y-6 py-6" : "mx-auto max-w-5xl space-y-6 p-6";

  return (
    <div className={wrap}>
      {!omitPageHeader ? (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">📋 Riwayat Booking Cuti</h1>
            <p className="mt-1 text-slate-500">Lihat semua booking cuti Anda</p>
          </div>
          <button
            onClick={() => router.replace(basePath)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Booking Cuti
          </button>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Riwayat pengajuan</h2>
          <p className="mt-1 text-sm text-slate-500">Status dan detail cuti yang pernah Anda ajukan</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-1 text-xs text-amber-700">Menunggu HR</p>
          <p className="text-2xl font-bold text-amber-800">
            {requests.filter((r) => r.status === "pending").length}
          </p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="mb-1 text-xs text-green-600">Disetujui</p>
              <p className="text-2xl font-bold text-green-700">
                {requests.filter((r) => r.status === "approved").length}
              </p>
            </div>
            <CheckCircle className="h-10 w-10 text-green-300" />
          </div>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-4">
          <p className="mb-1 text-xs text-red-600">Ditolak HR</p>
          <p className="text-2xl font-bold text-red-700">{requests.filter((r) => r.status === "rejected").length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="mb-1 text-xs text-gray-600">Dibatalkan Anda</p>
              <p className="text-2xl font-bold text-gray-700">
                {requests.filter((r) => r.status === "cancelled").length}
              </p>
            </div>
            <XCircle className="h-10 w-10 text-gray-300" />
          </div>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Calendar className="mx-auto mb-4 h-16 w-16 text-slate-300" />
          <p className="mb-2 text-slate-600">Belum ada riwayat booking</p>
          <p className="mb-4 text-sm text-slate-400">Lakukan booking cuti pertama Anda</p>
          <button
            onClick={() => router.replace(basePath)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2 text-white transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Pengajuan di kalender
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className={`rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md ${
                request.status === "cancelled" ? "border-gray-200 opacity-60" : "border-slate-200"
              }`}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                      request.status === "cancelled" || request.status === "rejected"
                        ? "bg-gray-100"
                        : request.status === "pending"
                          ? "bg-amber-100"
                          : "bg-green-100"
                    }`}
                  >
                    <Calendar
                      className={`h-6 w-6 ${
                        request.status === "cancelled" || request.status === "rejected"
                          ? "text-gray-400"
                          : request.status === "pending"
                            ? "text-amber-600"
                            : "text-green-600"
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-800">🏖️ Cuti</p>
                    <p className="text-xs text-slate-500">
                      Diajukan ke sistem:{" "}
                      {request.booking_date || request.created
                        ? new Date(request.created || request.booking_date).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Baris di bawah adalah <strong>tanggal cuti</strong> (mulai–selesai), bukan tanggal pengajuan di atas.
                    </p>
                  </div>
                </div>
                {getStatusBadge(request.status)}
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDateRange(request.start_date, request.end_date)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="h-4 w-4" />
                  <span>{calculateDays(request.start_date, request.end_date)} hari</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>
                    <span className="mr-1 text-slate-400">Divisi:</span>
                    {request.division?.trim() || "—"}
                  </span>
                </div>
              </div>

              <div className="mb-4 rounded-xl bg-slate-50 p-3">
                <p className="mb-1 text-xs text-slate-500">Alasan:</p>
                <p className="text-sm text-slate-700">{request.reason}</p>
              </div>

              {(request.status === "approved" || request.status === "rejected") &&
                formatLeaveHrActionSummary(request) && (
                  <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2">
                    <p className="mb-0.5 text-[11px] font-medium text-indigo-800">
                      Penanganan oleh HR
                    </p>
                    <p className="text-sm text-indigo-950">{formatLeaveHrActionSummary(request)}</p>
                  </div>
                )}

              {request.status === "approved" &&
                (() => {
                  const d = calendarDaysFromTodayUntilLeaveStart(request.start_date);
                  return d !== null && d >= 1 && d < 2;
                })() && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-medium">Sudah disetujui HR — tidak bisa dibatalkan dari sini</p>
                    <p className="mt-1 text-xs text-amber-800/90">
                      Cuti yang disetujui hanya dapat dibatalkan <strong>paling lambat H−2</strong> (dua hari kalender
                      sebelum tanggal mulai). Mulai <strong>H−1</strong>, pembatalan hanya lewat HR.
                    </p>
                  </div>
                )}

              {canCancel(request) && (
                <button
                  onClick={() => handleCancelBooking(request.id)}
                  disabled={cancelling === request.id}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-200 py-2 px-4 font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cancelling === request.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Membatalkan...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      Batalkan
                    </>
                  )}
                </button>
              )}

              {request.status === "cancelled" && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                  <p className="text-xs text-gray-600">Pengajuan / cuti ini telah dibatalkan</p>
                </div>
              )}

              {request.status === "rejected" && (
                <div className="mt-3 space-y-2 rounded-lg border border-red-100 bg-red-50 p-3 text-left">
                  <p className="text-xs font-medium text-red-800">Pengajuan ditolak oleh HR.</p>
                  {request.rejection_reason?.trim() ? (
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-red-600/90">Alasan dari HR</p>
                      <p className="text-sm text-red-950">{request.rejection_reason.trim()}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-red-700">
                      (Belum ada teks penolakan tersimpan — ajukan ulang atau hubungi HR jika perlu.)
                    </p>
                  )}
                  <p className="text-xs text-red-700/90">Anda dapat mengajukan lagi dengan tanggal lain jika perlu.</p>
                </div>
              )}

              {!canCancel(request) && request.status === "approved" && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                  <p className="text-xs text-blue-600">Cuti sudah dimulai atau sedang berlangsung</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="rounded-xl border border-slate-300 px-4 py-2 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2">
            {page} / {totalPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="rounded-xl border border-slate-300 px-4 py-2 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Berikutnya
          </button>
        </div>
      )}
    </div>
  );
}
