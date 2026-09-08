"use client";

import { pb } from "@/lib/pocketbase";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOvertimeForUser,
  createStaffOvertimeRequest,
  staffAcceptAssignment,
  staffDeclineAssignment,
  computeOvertimeHours,
  formatOvertimeHrActionSummary,
  OVERTIME_STATUS_LABEL,
  type OvertimeRequest,
  type OvertimeStatus,
} from "@/lib/overtime";
import { formatIdr } from "@/lib/hr-compensation";
import { blurActiveElement } from "@/lib/blur-active-input";
import { filterTimeHmTyping, formalizeTimeHmInput } from "@/lib/time-hm-input";
import { canAccess } from "@/lib/rbac";
import {
  Loader2,
  Moon,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  AlertTriangle,
} from "lucide-react";

export default function StaffOvertimePage() {
  const [rows, setRows] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  const [formDate, setFormDate] = useState("");
  const [formStart, setFormStart] = useState("18:00");
  const [formEnd, setFormEnd] = useState("22:00");
  const [formReason, setFormReason] = useState("");
  const [formBusy, setFormBusy] = useState(false);

  const uid = pb.authStore.model?.id ?? "";
  const current = pb.authStore.model;
  const hasAccess = !!current && canAccess(current, "/dashboard-staff");

  const load = useCallback(async () => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchOvertimeForUser(uid);
      setRows(list);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const todayYmd = () => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  useEffect(() => {
    if (!formDate) setFormDate(todayYmd());
  }, [formDate]);

  const pendingConfirm = useMemo(
    () => rows.filter((r) => r.status === "waiting_staff"),
    [rows]
  );

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

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const startHm = formalizeTimeHmInput(formStart);
    const endHm = formalizeTimeHmInput(formEnd);
    setFormStart(startHm);
    setFormEnd(endHm);
    setFormBusy(true);
    const res = await createStaffOvertimeRequest({
      work_date: formDate,
      start_time: startHm,
      end_time: endHm,
      reason: formReason,
    });
    setFormBusy(false);
    alert(res.message);
    if (res.success) {
      setFormReason("");
      setShowForm(false);
      void load();
    }
    blurActiveElement();
  };

  const accept = async (id: string, fromHrApproval?: boolean) => {
    if (
      !confirm(
        fromHrApproval
          ? "Terima persetujuan HR (nominal lembur akan masuk gaji)?"
          : "Terima penunjukan lembur ini?"
      )
    )
      return;
    setActing(id);
    const res = await staffAcceptAssignment(id);
    setActing(null);
    alert(res.message);
    if (res.success) void load();
    blurActiveElement();
  };

  const decline = async () => {
    if (!declineId) return;
    setActing(declineId);
    const res = await staffDeclineAssignment(declineId, declineNote);
    setActing(null);
    if (res.success) {
      setDeclineId(null);
      setDeclineNote("");
      void load();
    }
    alert(res.message);
    blurActiveElement();
  };

  if (!hasAccess || !current) {
    return <div className="p-6 text-red-600">Tidak punya akses.</div>;
  }

  if (!uid) {
    return (
      <div className="p-6">
        <p className="text-slate-600">Silakan login kembali.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Lembur</h1>
        <p className="mt-1 text-sm text-slate-500">
          Terima atau tolak penunjukan dari HR, ajukan lembur sendiri, dan lihat riwayat.
        </p>
      </div>

      {pendingConfirm.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-5">
          <div className="mb-3 flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">Perlu konfirmasi Anda ({pendingConfirm.length})</span>
          </div>
          <div className="space-y-3">
            {pendingConfirm.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <p className="font-medium text-slate-800">
                    {r.work_date} · {r.start_time} – {r.end_time} ({r.hours} jam)
                  </p>
                  <p className="mt-1 text-slate-600">{r.reason}</p>
                  {r.hr_note ? (
                    <p className="mt-1 text-xs text-indigo-800">
                      <strong>Dari HR:</strong> {r.hr_note}
                    </p>
                  ) : null}
                  {r.pay_amount != null && r.pay_amount > 0 ? (
                    <p className="mt-2 text-sm font-semibold text-emerald-800">
                      Bayaran: {formatIdr(r.pay_amount)}
                      {r.hourly_rate ? (
                        <span className="ml-1 text-xs font-normal">
                          ({formatIdr(r.hourly_rate)}/jam × {r.hours} jam)
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {r.source === "staff_request" ? (
                    <p className="mt-1 text-xs text-amber-800">HR sudah setujui — konfirmasi untuk final.</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={acting === r.id}
                    onClick={() => void accept(r.id, r.source === "staff_request")}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 sm:flex-none"
                  >
                    {acting === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    Terima
                  </button>
                  <button
                    type="button"
                    disabled={acting === r.id}
                    onClick={() => {
                      setDeclineId(r.id);
                      setDeclineNote("");
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border-2 border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 sm:flex-none"
                  >
                    <XCircle className="h-4 w-4" />
                    Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Ajukan lembur</h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Form pengajuan
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitRequest} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Tanggal</label>
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="text-sm text-slate-600 sm:col-span-2">
              Perkiraan: <strong>{computeOvertimeHours(formStart, formEnd).toFixed(2)} jam</strong>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Jam mulai (HH:mm)</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                required
                maxLength={5}
                value={formStart}
                onChange={(e) => setFormStart(filterTimeHmTyping(e.target.value))}
                onBlur={() => setFormStart((v) => formalizeTimeHmInput(v))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                placeholder="09:00"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Jam selesai (HH:mm)</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                required
                maxLength={5}
                value={formEnd}
                onChange={(e) => setFormEnd(filterTimeHmTyping(e.target.value))}
                onBlur={() => setFormEnd((v) => formalizeTimeHmInput(v))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                placeholder="18:00"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Alasan (min. 10 karakter)</label>
            <textarea
              required
              rows={3}
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              placeholder="Jelaskan kebutuhan lembur Anda"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={formBusy}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {formBusy ? "Mengirim…" : "Kirim ke HR"}
          </button>
        </form>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Riwayat</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
            <Moon className="mx-auto mb-2 h-10 w-10 text-slate-300" />
            Belum ada data lembur.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {badge(r.status)}
                  {r.source === "hr_assignment" ? (
                    <span className="text-[10px] font-semibold uppercase text-purple-700">Dari HR</span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase text-sky-700">Pengajuan saya</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {r.work_date}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {r.start_time} – {r.end_time} ({r.hours} jam)
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{r.reason}</p>
                {r.hr_note ? (
                  <p className="mt-1 text-xs text-indigo-800">
                    <strong>Catatan HR:</strong> {r.hr_note}
                  </p>
                ) : null}
                {r.status === "hr_rejected" && r.rejection_reason?.trim() && (
                  <p className="mt-2 rounded border border-red-100 bg-red-50 px-2 py-1 text-xs text-red-900">
                    Alasan penolakan HR: {r.rejection_reason}
                  </p>
                )}
                {r.status === "staff_declined" && r.staff_decline_note && (
                  <p className="mt-1 text-xs text-orange-800">Anda menolak: {r.staff_decline_note}</p>
                )}
                {formatOvertimeHrActionSummary(r) && (
                  <p className="mt-2 text-xs text-slate-500">Keputusan HR: {formatOvertimeHrActionSummary(r)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {declineId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="font-semibold text-slate-800">Tolak penunjukan</h2>
            <p className="mt-1 text-sm text-slate-500">Opsional: beri keterangan untuk HR.</p>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              rows={3}
              className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Contoh: Sudah ada janji keluarga / tidak bisa di tanggal tersebut."
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeclineId(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={acting === declineId}
                onClick={() => void decline()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Kirim penolakan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
