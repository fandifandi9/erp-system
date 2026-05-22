"use client";

import { useEffect, useState, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import {
  approveLeaveRequestByHr,
  rejectLeaveRequestByHr,
  coerceLeaveYmd,
  leaveTouchesCalendarMonth,
  normalizeLeaveRequestsFromPb,
  formatLeaveHrActionSummary,
  type LeaveRequest as LeaveRequestRow,
} from "@/lib/leave";
import {
  Calendar,
  User,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Filter,
  Search,
  Building2,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { canAccess } from "@/lib/rbac";
import {
  formatIdr,
  fetchApprovedLeavesOnDate,
} from "@/lib/hr-compensation";

type HrLeaveRow = LeaveRequestRow & {
  expand?: {
    user?: {
      name?: string;
      email?: string;
    };
  };
};

export default function LeaveMonitoringPage() {
  const router = useRouter();
  const [leaves, setLeaves] = useState<HrLeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected" | "cancelled"
  >("pending");
  const [actingId, setActingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [divisions, setDivisions] = useState<string[]>([]);
  const now = new Date();
  const [periodMode, setPeriodMode] = useState<"all" | "month">("all");
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [dateFilter, setDateFilter] = useState("");
  const [onDateLeaves, setOnDateLeaves] = useState<
    Awaited<ReturnType<typeof fetchApprovedLeavesOnDate>>
  >([]);
  const [onDateLoading, setOnDateLoading] = useState(false);

  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState("");
  
  const currentUser = pb.authStore.model;
  const hasAccess = !!currentUser && canAccess(currentUser, "/hr/leave");

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      /**
       * Jangan filter `status` di server — tab HR (Menunggu/Disetujui/…) hanya di klien.
       * Kalau filter status di API, batch hanya berisi satu status → kartu ringkasan lain selalu 0.
       */
      const common = { requestKey: null as null };

      let result;
      try {
        result = await pb.collection("leave_requests").getList(1, 500, {
          ...common,
          sort: "-created",
          expand: "user",
        });
      } catch (inner) {
        console.warn(
          "leave_requests: getList (created + expand) gagal, coba tanpa expand:",
          inner
        );
        result = await pb.collection("leave_requests").getList(1, 500, {
          ...common,
          sort: "-created",
        });
      }

      const mapped = normalizeLeaveRequestsFromPb(result.items as unknown[]);
      const leaveData = (mapped as HrLeaveRow[]).slice().sort((a, b) => {
        const ta = new Date(a.booking_date || a.created).getTime();
        const tb = new Date(b.booking_date || b.created).getTime();
        return tb - ta;
      });
      setLeaves(leaveData);

      const uniqueDivs = [
        ...new Set(
          leaveData
            .map((l) => (l.division || (l as { devision?: string }).devision || "").trim())
            .filter((d): d is string => d.length > 0)
        ),
      ];
      setDivisions(uniqueDivs);
    } catch (err) {
      console.error("Fetch leaves error:", err);
      const msg =
        err instanceof Error ? err.message : "Gagal memuat data cuti dari server.";
      setFetchError(msg);
      setLeaves([]);
      setDivisions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    fetchLeaves();
  }, [hasAccess, fetchLeaves]);

  useEffect(() => {
    if (!hasAccess || !dateFilter) {
      setOnDateLeaves([]);
      return;
    }
    let ok = true;
    setOnDateLoading(true);
    void (async () => {
      const rows = await fetchApprovedLeavesOnDate(dateFilter);
      if (ok) {
        setOnDateLeaves(rows);
        setOnDateLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [hasAccess, dateFilter]);

  const runApprove = async (id: string) => {
    setActingId(id);
    try {
      const res = await approveLeaveRequestByHr(id);
      alert(res.message);
      if (res.success) await fetchLeaves();
    } finally {
      setActingId(null);
    }
  };

  const openRejectModal = (id: string) => {
    setRejectReasonDraft("");
    setRejectModalId(id);
  };

  const closeRejectModal = () => {
    setRejectModalId(null);
    setRejectReasonDraft("");
  };

  const submitReject = async () => {
    if (!rejectModalId) return;
    setActingId(rejectModalId);
    try {
      const res = await rejectLeaveRequestByHr(rejectModalId, {
        reason: rejectReasonDraft,
      });
      alert(res.message);
      if (res.success) {
        closeRejectModal();
        await fetchLeaves();
      }
    } finally {
      setActingId(null);
    }
  };

  // Guard: Only HR & Owner
  if (!hasAccess) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          ❌ Akses ditolak. Halaman ini hanya untuk HR dan Owner.
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const y = coerceLeaveYmd(dateStr);
    if (!y) return "—";
    return new Date(`${y}T12:00:00`).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateRange = (start: string, end: string) => {
    const s = coerceLeaveYmd(start);
    const e = coerceLeaveYmd(end);
    if (!s || !e) return "—";
    if (s === e) return formatDate(start);
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  const leaveTouchesDate = (start: string, end: string, ymd: string) => {
    const s = coerceLeaveYmd(start);
    const e = coerceLeaveYmd(end);
    const d = ymd.slice(0, 10);
    if (!s || !e || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    return s <= d && e >= d;
  };

  const calculateDays = (start: string, end: string) => {
    const ss = coerceLeaveYmd(start);
    const ee = coerceLeaveYmd(end);
    if (!ss || !ee) return 0;
    const startDate = new Date(`${ss}T12:00:00`);
    const endDate = new Date(`${ee}T12:00:00`);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: {
        bg: "bg-amber-100",
        text: "text-amber-900",
        label: "Menunggu",
        icon: Clock,
      },
      approved: { bg: "bg-green-100", text: "text-green-700", label: "Disetujui", icon: CheckCircle },
      rejected: {
        bg: "bg-red-50",
        text: "text-red-700",
        label: "Ditolak",
        icon: XCircle,
      },
      cancelled: { bg: "bg-gray-100", text: "text-gray-700", label: "✗ Batal", icon: XCircle },
    };

    const badge = badges[status as keyof typeof badges] || badges.pending;
    const Icon = badge.icon;

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  const leavesInPeriod =
    periodMode === "all"
      ? leaves
      : leaves.filter((l) =>
          leaveTouchesCalendarMonth(l.start_date, l.end_date, periodYear, periodMonth)
        );

  const stats = {
    pending: leavesInPeriod.filter((l) => l.status === "pending").length,
    approved: leavesInPeriod.filter((l) => l.status === "approved").length,
    rejected: leavesInPeriod.filter((l) => l.status === "rejected").length,
    cancelled: leavesInPeriod.filter((l) => l.status === "cancelled").length,
    total: leavesInPeriod.length,
  };

  const yearChoices = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 2 + i);

  const monthLabels = [
    { v: 1, label: "Januari" },
    { v: 2, label: "Februari" },
    { v: 3, label: "Maret" },
    { v: 4, label: "April" },
    { v: 5, label: "Mei" },
    { v: 6, label: "Juni" },
    { v: 7, label: "Juli" },
    { v: 8, label: "Agustus" },
    { v: 9, label: "September" },
    { v: 10, label: "Oktober" },
    { v: 11, label: "November" },
    { v: 12, label: "Desember" },
  ];

  const leavesForStatusTab = leavesInPeriod.filter((leave) =>
    filter === "all" ? true : leave.status === filter
  );

  // Filter by search query and division
  const filteredLeaves = leavesForStatusTab.filter((leave) => {
    const userName = leave.expand?.user?.name?.toLowerCase() || "";
    const userEmail = leave.expand?.user?.email?.toLowerCase() || "";
    const query = searchQuery.toLowerCase();
    const matchesSearch = userName.includes(query) || userEmail.includes(query);
    const divVal =
      leave.division || String((leave as { devision?: string }).devision ?? "").trim();
    const matchesDiv = divisionFilter === "all" || divVal === divisionFilter;
    const matchesDate =
      !dateFilter || leaveTouchesDate(leave.start_date, leave.end_date, dateFilter);
    return matchesSearch && matchesDiv && matchesDate;
  });

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {fetchError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Tidak bisa memuat daftar cuti</p>
          <p className="mt-1 opacity-90">{fetchError}</p>
          <p className="mt-2 text-xs text-amber-800">
            Pastikan koleksi <code className="rounded bg-amber-100 px-1">leave_requests</code> punya field{" "}
            <code className="rounded bg-amber-100 px-1">status</code>,{" "}
            <code className="rounded bg-amber-100 px-1">user</code> (relasi), dan rule list untuk HR/Owner.
          </p>
        </div>
      )}
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">📊 Pengajuan &amp; Cuti</h1>
          <p className="text-slate-500 mt-1">
            ACC pengajuan (pending → disetujui / ditolak). Kuota divisi dicek saat Anda menyetujui. Filter bulan/tahun
            menggunakan <strong>tanggal cuti</strong>, bukan tanggal pengajuan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/hr/compensation/settings"
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition flex items-center gap-2 font-medium text-sm"
          >
            Pengaturan nominal cuti
          </Link>
          <button
            type="button"
            onClick={() => router.push("/hr/leave/settings")}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 font-medium text-sm"
          >
            <Settings className="w-4 h-4" />
            Kuota divisi
          </button>
        </div>
      </div>

      {/* INFO BANNER */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-blue-900 mb-1">Alur persetujuan HR</p>
            <p className="text-sm text-blue-700">
              Staff mengirim pengajuan sebagai <strong>pending</strong> dari kalender aplikasi (<strong>satu tanggal =
              satu pengajuan</strong>, 1 hari per tiket). Anda menyetujui jika tidak bentrok dengan cuti lain karyawan tersebut dan
              kuota divisi masih ada; atau tolak pengajuan. Kuota sistem: maks. <strong>3×</strong> pengajuan (pending + disetujui)
              per karyawan per bulan kalender menurut tanggal dibuat.
            </p>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <p className="text-sm text-amber-800 mb-1">Menunggu ACC</p>
          <p className="text-3xl font-bold text-amber-900">{stats.pending}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 mb-1">Disetujui</p>
              <p className="text-3xl font-bold text-green-700">{stats.approved}</p>
            </div>
            <CheckCircle className="w-10 h-10 text-green-300" />
          </div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4">
          <p className="text-sm text-red-700 mb-1">Ditolak</p>
          <p className="text-3xl font-bold text-red-800">{stats.rejected}</p>
        </div>
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Batal</p>
              <p className="text-3xl font-bold text-gray-700">{stats.cancelled}</p>
            </div>
            <XCircle className="w-10 h-10 text-gray-300" />
          </div>
        </div>
        <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-indigo-600 mb-1">Total</p>
              <p className="text-3xl font-bold text-indigo-700">{stats.total}</p>
            </div>
            <Calendar className="w-10 h-10 text-indigo-300" />
          </div>
        </div>
      </div>

      {/* FILTERS & SEARCH */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              filter === "pending"
                ? "bg-amber-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Clock className="w-4 h-4" />
            Menunggu ({stats.pending})
          </button>
          <button
            type="button"
            onClick={() => setFilter("approved")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              filter === "approved"
                ? "bg-green-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            Disetujui ({stats.approved})
          </button>
          <button
            type="button"
            onClick={() => setFilter("rejected")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              filter === "rejected"
                ? "bg-red-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <XCircle className="w-4 h-4" />
            Ditolak ({stats.rejected})
          </button>
          <button
            type="button"
            onClick={() => setFilter("cancelled")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              filter === "cancelled"
                ? "bg-gray-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <XCircle className="w-4 h-4" />
            Batal ({stats.cancelled})
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              filter === "all"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            Semua
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-stretch sm:items-end">
          <div className="flex flex-wrap gap-2 items-center rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
            <span className="text-xs font-semibold text-slate-600 shrink-0">Periode cuti</span>
            <select
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value as "all" | "month")}
              className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Semua periode</option>
              <option value="month">Bulan &amp; tahun</option>
            </select>
            {periodMode === "month" && (
              <>
                <select
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(Number(e.target.value))}
                  className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 min-w-[8.5rem]"
                >
                  {monthLabels.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select
                  value={periodYear}
                  onChange={(e) => setPeriodYear(Number(e.target.value))}
                  className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  {yearChoices.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama atau email karyawan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
            </div>
          </div>
          <select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm min-w-[10rem]"
          >
            <option value="all">Semua Division</option>
            {divisions.map((div) => (
              <option key={div} value={div}>
                {div}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-sm text-slate-700 focus:outline-none"
              title="Filter cuti yang jatuh pada tanggal ini"
            />
            {dateFilter ? (
              <button
                type="button"
                onClick={() => setDateFilter("")}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {dateFilter ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            Cuti disetujui pada tanggal {formatDate(dateFilter)}
          </p>
          {onDateLoading ? (
            <div className="mt-3 flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-700" />
            </div>
          ) : onDateLeaves.length === 0 ? (
            <p className="mt-2 text-sm text-emerald-800">Tidak ada cuti disetujui pada tanggal ini.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {onDateLeaves.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">
                    {row.userName} · {row.division}
                  </span>
                  <span className="text-emerald-800">
                    {formatIdr(row.daily_rate)}/hari
                    {row.compensation_amount > 0 ? (
                      <span className="ml-2 text-slate-600">
                        (total rentang: {formatIdr(row.compensation_amount)})
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* LEAVE REQUESTS */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filteredLeaves.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <p className="text-lg font-medium text-slate-800">Tidak ada data</p>
          <p className="text-sm text-slate-500 mt-1">
            {searchQuery || divisionFilter !== "all" || dateFilter
              ? "Tidak ditemukan hasil untuk filter ini"
              : "Belum ada booking cuti"}
          </p>
          {!searchQuery && divisionFilter === "all" && (
            <div className="mt-6 max-w-2xl mx-auto text-left text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-slate-700">Data ada di PocketBase Admin tapi di sini kosong?</p>
              <p>
                Rule <strong>List</strong> / <strong>View</strong> koleksi{" "}
                <code className="rounded bg-white px-1 border">leave_requests</code> kemungkinan membatasi
                hanya record milik pengguna yang login — staff hanya bisa melihat <code className="rounded bg-white px-1 border">user = dirinya</code>,
                HR harus bisa melihat <strong>semua</strong> pengajuan. Di PocketBase → koleksi tersebut → ketik misalnya:
              </p>
              <pre className="overflow-x-auto rounded-lg bg-white border border-slate-200 p-3 text-[11px] leading-relaxed">
{`@request.auth.id != "" && (
  user = @request.auth.id ||
  @request.auth.role = "hr" ||
  @request.auth.role_code = "hr" ||
  @request.auth.role = "owner"
)`}
              </pre>
              <p>Sesuaikan nama field role di tabel <code className="rounded bg-white px-1 border">users</code> Anda (berapa pun variasinya — yang penting OR untuk HR dan owner). Untuk nama karyawan di kartu: rule <strong>View</strong> koleksi <code className="rounded bg-white px-1 border">users</code> harus mengizinkan HR membaca user terkait (expand).</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLeaves.map((leave) => {
            const rowDivision =
              leave.division ||
              String((leave as { devision?: string }).devision ?? "").trim();
            return (
            <div
              key={leave.id}
              className={`bg-white rounded-xl border p-6 hover:shadow-lg transition ${
                leave.status === "cancelled" || leave.status === "rejected"
                  ? "border-gray-200 opacity-60"
                  : "border-slate-200"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                {/* LEFT */}
                <div className="flex gap-4 flex-1 min-w-0">
                  {/* USER AVATAR */}
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                      leave.status === "cancelled" || leave.status === "rejected"
                        ? "bg-gray-100"
                        : leave.status === "pending"
                          ? "bg-amber-50"
                          : "bg-indigo-100"
                    }`}
                  >
                    <User
                      className={`w-6 h-6 ${
                        leave.status === "cancelled" || leave.status === "rejected"
                          ? "text-gray-400"
                          : leave.status === "pending"
                            ? "text-amber-700"
                            : "text-indigo-600"
                      }`}
                    />
                  </div>

                  {/* INFO */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-semibold text-slate-800">
                        {leave.expand?.user?.name || leave.expand?.user?.email || "Unknown User"}
                      </h3>
                      {getStatusBadge(leave.status)}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-3">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDateRange(leave.start_date, leave.end_date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Clock className="w-4 h-4" />
                        <span>{calculateDays(leave.start_date, leave.end_date)} hari</span>
                      </div>
                      <div className="flex items-center gap-2 text-orange-600 font-medium">
                        <Building2 className="w-4 h-4" />
                        <span>{rowDivision || "—"}</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3 mb-2">
                      <p className="text-xs text-slate-500 mb-1">Alasan:</p>
                      <p className="text-sm text-slate-700">{leave.reason}</p>
                    </div>

                    {leave.status === "approved" &&
                    (leave.compensation_amount != null && leave.compensation_amount > 0) ? (
                      <p className="mb-2 text-sm font-medium text-emerald-800">
                        Kompensasi: {formatIdr(leave.compensation_amount)}
                        {leave.daily_compensation_rate != null && leave.daily_compensation_rate > 0 ? (
                          <span className="ml-1 text-xs font-normal text-emerald-700">
                            ({formatIdr(leave.daily_compensation_rate)}/hari)
                          </span>
                        ) : null}
                      </p>
                    ) : null}

                    {leave.status === "rejected" && Boolean(leave.rejection_reason?.trim()) && (
                      <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 mb-2">
                        <p className="text-[11px] font-medium text-red-800 mb-0.5">
                          Alasan penolakan (terlihat staff)
                        </p>
                        <p className="text-sm text-red-900">{leave.rejection_reason}</p>
                      </div>
                    )}

                    {(leave.status === "approved" || leave.status === "rejected") &&
                      formatLeaveHrActionSummary(leave) && (
                        <div className="mb-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2">
                          <p className="mb-0.5 text-[11px] font-medium text-indigo-800">
                            {leave.status === "approved"
                              ? "Keputusan HR — disetujui"
                              : "Keputusan HR — ditolak"}
                          </p>
                          <p className="text-sm text-indigo-950">{formatLeaveHrActionSummary(leave)}</p>
                        </div>
                      )}

                    {leave.position?.trim() ? (
                      <p className="text-xs text-slate-400">Jabatan: {leave.position.trim()}</p>
                    ) : null}
                  </div>
                </div>

                {leave.status === "pending" && (
                  <div className="flex sm:flex-col gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={actingId === leave.id}
                      onClick={() => void runApprove(leave.id)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                    >
                      {actingId === leave.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Setujui
                    </button>
                    <button
                      type="button"
                      disabled={actingId === leave.id}
                      onClick={() => openRejectModal(leave.id)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Tolak
                    </button>
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {rejectModalId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => {
            if (actingId !== rejectModalId) closeRejectModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-dialog-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="reject-dialog-title" className="text-lg font-semibold text-slate-800">
              Tolak pengajuan cuti
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Staff akan melihat teks ini di riwayat cuti. Wajib diisi (min. 5 karakter).
            </p>
            <textarea
              value={rejectReasonDraft}
              onChange={(e) => setRejectReasonDraft(e.target.value)}
              rows={4}
              placeholder="Contoh: Kuota divisi penuh pada tanggal tersebut / bentrok dengan kebutuhan operasional."
              className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            />
            <p className="mt-1 text-xs text-slate-400">
              {rejectReasonDraft.trim().length}/5+ karakter
            </p>
            <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                disabled={actingId === rejectModalId}
                onClick={closeRejectModal}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={
                  actingId === rejectModalId || rejectReasonDraft.trim().length < 5
                }
                onClick={() => void submitReject()}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actingId === rejectModalId ? "Memproses…" : "Kirim penolakan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
