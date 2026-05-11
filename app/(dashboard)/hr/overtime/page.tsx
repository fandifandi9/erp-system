"use client";

import { pb } from "@/lib/pocketbase";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  normalizeOvertimeFromPb,
  createHrAssignment,
  hrApproveStaffRequest,
  hrRejectStaffRequest,
  computeOvertimeHours,
  formatOvertimeHrActionSummary,
  OVERTIME_STATUS_LABEL,
  type OvertimeRequest,
  type OvertimeStatus,
} from "@/lib/overtime";
import { canAccess } from "@/lib/rbac";
import { Loader2, Moon, User, CheckCircle, XCircle, Plus, Clock, Calendar } from "lucide-react";

type HrRow = OvertimeRequest & {
  expand?: {
    user?: { name?: string; email?: string };
  };
};

type PbUser = { id: string; name?: string; email?: string };

export default function HrOvertimePage() {
  const [rows, setRows] = useState<HrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "wait_staff" | "wait_hr" | "done">("all");
  const [users, setUsers] = useState<PbUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectDraft, setRejectDraft] = useState("");

  const [assignUser, setAssignUser] = useState("");
  const [assignDate, setAssignDate] = useState("");
  const [assignStart, setAssignStart] = useState("18:00");
  const [assignEnd, setAssignEnd] = useState("22:00");
  const [assignReason, setAssignReason] = useState("");
  const [assignHrNote, setAssignHrNote] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  const current = pb.authStore.model;
  const hasAccess = !!current && canAccess(current, "/hr/overtime");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pb.collection("overtime_requests").getFullList({
        sort: "-created",
        expand: "user",
        requestKey: null,
      });
      const mapped = normalizeOvertimeFromPb(res as unknown[]);
      const merged = mapped.map((m, i) => ({
        ...m,
        expand: (res[i] as { expand?: HrRow["expand"] }).expand,
      })) as HrRow[];
      setRows(merged);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    void load();
  }, [hasAccess, load]);

  useEffect(() => {
    if (!hasAccess) return;
    let ok = true;
    (async () => {
      try {
        const list = await pb.collection("users").getFullList({
          filter: 'status="active"',
          sort: "name",
          fields: "id,name,email",
          requestKey: null,
        });
        if (ok) setUsers(list as unknown as PbUser[]);
      } catch {
        if (ok) setUsers([]);
      }
    })();
    return () => {
      ok = false;
    };
  }, [hasAccess]);

  const todayYmd = () => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  useEffect(() => {
    if (!assignDate) setAssignDate(todayYmd());
  }, [assignDate]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "wait_staff") return r.status === "waiting_staff";
      if (filter === "wait_hr") return r.status === "waiting_hr";
      if (filter === "done") {
        return (
          r.status === "staff_accepted" ||
          r.status === "staff_declined" ||
          r.status === "hr_approved" ||
          r.status === "hr_rejected"
        );
      }
      return true;
    });
  }, [rows, filter]);

  const stats = useMemo(() => {
    return {
      waitStaff: rows.filter((r) => r.status === "waiting_staff").length,
      waitHr: rows.filter((r) => r.status === "waiting_hr").length,
    };
  }, [rows]);

  const runApprove = async (id: string) => {
    setActing(id);
    const res = await hrApproveStaffRequest(id);
    setActing(null);
    alert(res.message);
    if (res.success) void load();
  };

  const runReject = async () => {
    if (!rejectId) return;
    setActing(rejectId);
    const res = await hrRejectStaffRequest(rejectId, rejectDraft);
    setActing(null);
    if (res.success) {
      setRejectId(null);
      setRejectDraft("");
      void load();
    }
    alert(res.message);
  };

  const submitAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignBusy(true);
    const res = await createHrAssignment({
      userId: assignUser,
      work_date: assignDate,
      start_time: assignStart,
      end_time: assignEnd,
      reason: assignReason,
      hr_note: assignHrNote,
    });
    setAssignBusy(false);
    alert(res.message);
    if (res.success) {
      setAssignReason("");
      setAssignHrNote("");
      setShowForm(false);
      void load();
    }
  };

  if (!hasAccess) {
    return <div className="p-6 text-red-600">Tidak punya akses.</div>;
  }

  const badge = (status: OvertimeStatus) => {
    const map: Record<OvertimeStatus, string> = {
      waiting_staff: "bg-amber-100 text-amber-900",
      waiting_hr: "bg-blue-100 text-blue-900",
      staff_accepted: "bg-emerald-100 text-emerald-900",
      staff_declined: "bg-orange-100 text-orange-900",
      hr_approved: "bg-green-100 text-green-900",
      hr_rejected: "bg-red-100 text-red-900",
    };
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[status]}`}>
        {OVERTIME_STATUS_LABEL[status]}
      </span>
    );
  };

  const displayName = (row: HrRow) =>
    row.expand?.user?.name?.trim() ||
    row.expand?.user?.email?.trim() ||
    row.user?.slice(0, 8) + "…";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Lembur</h1>
          <p className="mt-1 text-sm text-slate-500">
            Penunjukan lembur ke karyawan (staff terima/tolak), dan persetujuan pengajuan lembur dari staff.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Penunjukan lembur
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-xs font-medium text-amber-800">Menunggu staff</p>
          <p className="text-2xl font-bold text-amber-900">{stats.waitStaff}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4">
          <p className="text-xs font-medium text-blue-800">Menunggu ACC HR</p>
          <p className="text-2xl font-bold text-blue-900">{stats.waitHr}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-600">Filter</p>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="all">Semua</option>
            <option value="wait_staff">Hanya: tunggu staff</option>
            <option value="wait_hr">Hanya: tunggu HR</option>
            <option value="done">Selesai (semua status akhir)</option>
          </select>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={submitAssign}
          className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-indigo-900">Penunjukan lembur (HR → staff)</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Karyawan *</label>
              <select
                required
                value={assignUser}
                onChange={(e) => setAssignUser(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— Pilih —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email || u.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Tanggal kerja lembur *</label>
              <input
                type="date"
                required
                value={assignDate}
                onChange={(e) => setAssignDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Jam mulai * (HH:mm)</label>
              <input
                type="text"
                required
                placeholder="18:00"
                value={assignStart}
                onChange={(e) => setAssignStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Jam selesai * (HH:mm)</label>
              <input
                type="text"
                required
                placeholder="22:00"
                value={assignEnd}
                onChange={(e) => setAssignEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Perkiraan durasi:{" "}
            <strong>{computeOvertimeHours(assignStart, assignEnd).toFixed(2)} jam</strong>
          </p>
          <div>
            <label className="text-xs font-medium text-slate-600">Keterangan untuk sistem *</label>
            <textarea
              required
              rows={2}
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              placeholder="Ringkas mengapa lembur diperlukan"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Catatan ke staff (opsional)</label>
            <textarea
              rows={2}
              value={assignHrNote}
              onChange={(e) => setAssignHrNote(e.target.value)}
              placeholder="Instruksi tambahan yang terbaca staff"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={assignBusy}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {assignBusy ? "Menyimpan…" : "Kirim penunjukan"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              Tutup
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          <Moon className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          Tidak ada data untuk filter ini.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                    <User className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{displayName(row)}</span>
                      {badge(row.status)}
                      {row.source === "hr_assignment" ? (
                        <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-purple-800">
                          Penunjukan HR
                        </span>
                      ) : (
                        <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800">
                          Pengajuan staff
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        {row.work_date}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {row.start_time} – {row.end_time} ({row.hours} jam)
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{row.reason}</p>
                    {row.hr_note ? (
                      <p className="mt-1 text-xs text-indigo-800">
                        <strong>Catatan HR ke staff:</strong> {row.hr_note}
                      </p>
                    ) : null}
                    {row.source === "staff_request" &&
                      row.status === "hr_rejected" &&
                      row.rejection_reason?.trim() && (
                        <p className="mt-2 rounded border border-red-100 bg-red-50 px-2 py-1 text-xs text-red-900">
                          <strong>Alasan tolak:</strong> {row.rejection_reason}
                        </p>
                      )}
                    {row.status === "staff_declined" && row.staff_decline_note && (
                      <p className="mt-2 text-xs text-orange-800">
                        <strong>Staff menolak:</strong> {row.staff_decline_note}
                      </p>
                    )}
                    {formatOvertimeHrActionSummary(row) && (
                      <p className="mt-2 text-xs text-slate-500">
                        HR: {formatOvertimeHrActionSummary(row)}
                      </p>
                    )}
                  </div>
                </div>

                {row.source === "staff_request" && row.status === "waiting_hr" && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={acting === row.id}
                      onClick={() => void runApprove(row.id)}
                      className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {acting === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      Setujui
                    </button>
                    <button
                      type="button"
                      disabled={acting === row.id}
                      onClick={() => {
                        setRejectId(row.id);
                        setRejectDraft("");
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border-2 border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Tolak
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
          >
            <h2 className="text-lg font-semibold text-slate-800">Tolak pengajuan lembur</h2>
            <p className="mt-1 text-sm text-slate-500">Alasan tampil untuk staff (min. 5 karakter).</p>
            <textarea
              value={rejectDraft}
              onChange={(e) => setRejectDraft(e.target.value)}
              rows={4}
              className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Contoh: Tidak ada kebutuhan operasional / sudah ada jadwal lain."
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectId(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={acting === rejectId || rejectDraft.trim().length < 5}
                onClick={() => void runReject()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Kirim penolakan
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-800">Setup PocketBase</p>
        <p className="mt-1">
          Buat koleksi <code className="rounded bg-white px-1">overtime_requests</code> sesuai file migrasi proyek. Tanpa
          itu, halaman ini akan gagal memuat data.
        </p>
      </div>
    </div>
  );
}
