"use client";

import { pb } from "@/lib/pocketbase";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  ACTIVITY_TYPE_LABEL,
  createFieldActivityRequest,
  fetchFieldActivityForUser,
  formatFieldActivityHrSummary,
  staffCancelPending,
  type FieldActivityRequest,
  type FieldActivityType,
} from "@/lib/field_activity";
import { canAccess } from "@/lib/rbac";
import { Calendar, Loader2, MapPin, Send, XCircle, ExternalLink } from "lucide-react";

const TYPES: FieldActivityType[] = ["meeting", "visit", "out_of_town", "other"];

function pbUserIdSnapshot(): string {
  return (pb.authStore.model as { id?: string } | null)?.id ?? "";
}

export default function StaffFieldActivityPage() {
  const uid = useSyncExternalStore(
    (onStoreChange) => pb.authStore.onChange(onStoreChange),
    pbUserIdSnapshot,
    pbUserIdSnapshot
  );
  const [rows, setRows] = useState<FieldActivityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activityType, setActivityType] = useState<FieldActivityType>("meeting");
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");

  const hasAccess =
    !!pb.authStore.model && canAccess(pb.authStore.model, "/dashboard-staff/field-activity");

  const load = useCallback(async () => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchFieldActivityForUser(uid);
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = new Date();
    const y = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    if (!startDate) setStartDate(y);
    if (!endDate) setEndDate(y);
  }, [startDate, endDate]);

  const reasonLen = reason.trim().length;
  const destLen = destination.trim().length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) {
      alert("Sesi login tidak terbaca. Muat ulang halaman atau login kembali.");
      return;
    }
    if (destLen < 2) {
      alert("Isi tujuan / lokasi minimal 2 karakter.");
      return;
    }
    if (reasonLen < 10) {
      alert("Keterangan minimal 10 karakter (saat ini: " + reasonLen + ").");
      return;
    }
    setSubmitting(true);
    const res = await createFieldActivityRequest({
      start_date: startDate,
      end_date: endDate,
      activity_type: activityType,
      destination,
      reason,
    });
    setSubmitting(false);
    alert(res.message);
    if (res.success) {
      setDestination("");
      setReason("");
      void load();
    }
  };

  const badge = (r: FieldActivityRequest) => {
    const map: Record<string, string> = {
      pending_hr: "bg-amber-100 text-amber-900",
      approved: "bg-green-100 text-green-900",
      rejected: "bg-red-100 text-red-900",
      cancelled: "bg-slate-100 text-slate-700",
    };
    const label: Record<string, string> = {
      pending_hr: "Menunggu ACC HR",
      approved: "Disetujui",
      rejected: "Ditolak",
      cancelled: "Dibatalkan",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[r.status] ?? ""}`}>
        {label[r.status] ?? r.status}
      </span>
    );
  };

  if (!hasAccess) {
    return <div className="p-6 text-red-600">Tidak punya akses.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Aktivitas luar kantor</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ajukan <strong>sebelum</strong> tanggal tugas. Setelah HR menyetujui, check-in di hari itu boleh di luar radius kantor
          (GPS tetap dipakai untuk audit).
        </p>
        <Link
          href="/dashboard-staff/attendance"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Kembali ke Absensi
        </Link>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">Form pengajuan</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-600">Jenis aktivitas</label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as FieldActivityType)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">Tujuan / lokasi singkat *</label>
            <input
              required
              minLength={2}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Contoh: Client PT ABC, Jakarta / Meeting cabang Bandung"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Tanggal mulai *</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Tanggal selesai *</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">Keterangan / agenda (min. 10 karakter) *</label>
            <textarea
              required
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Uraian keperluan dinas agar HR dapat menilai."
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                reason.length > 0 && reasonLen < 10
                  ? "border-amber-400 bg-amber-50/50"
                  : "border-slate-300"
              }`}
            />
            <p
              className={`mt-1 text-xs ${reasonLen < 10 && reason.length > 0 ? "font-medium text-amber-800" : "text-slate-500"}`}
            >
              {reasonLen}/10 karakter (setelah trim, sama seperti validasi server)
            </p>
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Kirim pengajuan
        </button>
      </form>

      <div>
        <h2 className="mb-3 font-semibold text-slate-800">Riwayat pengajuan</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
            Belum ada pengajuan.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {badge(r)}
                  <span className="text-xs font-medium text-slate-600">{ACTIVITY_TYPE_LABEL[r.activity_type]}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-700">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {r.start_date} s.d. {r.end_date}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    {r.destination}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{r.reason}</p>
                {r.status === "rejected" && r.rejection_reason && (
                  <p className="mt-2 rounded border border-red-100 bg-red-50 px-2 py-1 text-xs text-red-900">
                    HR: {r.rejection_reason}
                  </p>
                )}
                {formatFieldActivityHrSummary(r) && (
                  <p className="mt-2 text-xs text-slate-500">Keputusan: {formatFieldActivityHrSummary(r)}</p>
                )}
                {r.status === "pending_hr" && (
                  <button
                    type="button"
                    disabled={cancelling === r.id}
                    onClick={async () => {
                      if (!confirm("Batalkan pengajuan ini?")) return;
                      setCancelling(r.id);
                      const out = await staffCancelPending(r.id);
                      setCancelling(null);
                      alert(out.message);
                      if (out.success) void load();
                    }}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    {cancelling === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                    Batalkan pengajuan
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
