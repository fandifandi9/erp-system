"use client";

import { pb } from "@/lib/pocketbase";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTIVITY_TYPE_LABEL,
  normalizeFieldActivityRows,
  hrApproveFieldActivity,
  hrRejectFieldActivity,
  formatFieldActivityHrSummary,
  FIELD_ACTIVITY_COLLECTION,
} from "@/lib/field_activity";
import type { FieldActivityRequest } from "@/lib/field_activity";
import { canAccess } from "@/lib/rbac";
import { Loader2, MapPin, Calendar, CheckCircle, XCircle, User } from "lucide-react";

type Row = FieldActivityRequest & {
  expand?: { user?: { name?: string; email?: string } };
};

export default function HrFieldActivityPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectDraft, setRejectDraft] = useState("");

  const [filter, setFilter] = useState<"all" | "pending">("pending");

  const current = pb.authStore.model;
  const hasAccess = !!current && canAccess(current, "/hr/field-activity");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pb.collection(FIELD_ACTIVITY_COLLECTION).getFullList({
        sort: "-created",
        expand: "user",
        requestKey: null,
      });
      const mapped = normalizeFieldActivityRows(res as unknown[]);
      const merged = mapped.map((m, i) => ({
        ...m,
        expand: (res[i] as { expand?: Row["expand"] }).expand,
      })) as Row[];
      setRows(merged);
    } catch {
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

  const filtered = useMemo(() => {
    if (filter === "pending") {
      return rows.filter((r) => r.status === "pending_hr");
    }
    return rows;
  }, [rows, filter]);

  const pendingCount = useMemo(() => rows.filter((r) => r.status === "pending_hr").length, [rows]);

  const runApprove = async (id: string) => {
    setActing(id);
    const res = await hrApproveFieldActivity(id);
    setActing(null);
    alert(res.message);
    if (res.success) void load();
  };

  const runReject = async () => {
    if (!rejectId) return;
    setActing(rejectId);
    const res = await hrRejectFieldActivity(rejectId, rejectDraft);
    setActing(null);
    if (res.success) {
      setRejectId(null);
      setRejectDraft("");
      void load();
    }
    alert(res.message);
  };

  const nameOf = (r: Row) =>
    r.expand?.user?.name?.trim() || r.expand?.user?.email?.trim() || r.user.slice(0, 8) + "…";

  if (!hasAccess) {
    return <div className="p-6 text-red-600">Tidak punya akses.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Aktivitas luar kantor</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tinjau pengajuan staff untuk meeting, kunjungan, dinas luar kota. Yang disetujui mengizinkan absensi di luar zona
          pada tanggal yang dicakup.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-800">Menunggu ACC</p>
          <p className="text-2xl font-bold text-amber-900">{pendingCount}</p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "pending")}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="pending">Hanya menunggu ACC</option>
          <option value="all">Semua</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-slate-200 py-10 text-center text-slate-500">Tidak ada data.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                    <User className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{nameOf(r)}</p>
                    <p className="text-sm text-slate-600">{ACTIVITY_TYPE_LABEL[r.activity_type]}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {r.start_date} – {r.end_date}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {r.destination}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{r.reason}</p>
                    {r.status === "rejected" && r.rejection_reason && (
                      <p className="mt-2 text-xs text-red-800">Penolakan: {r.rejection_reason}</p>
                    )}
                    {formatFieldActivityHrSummary(r) && (
                      <p className="mt-1 text-xs text-slate-500">{formatFieldActivityHrSummary(r)}</p>
                    )}
                  </div>
                </div>
                {r.status === "pending_hr" && (
                  <div className="flex gap-2 sm:flex-col">
                    <button
                      type="button"
                      disabled={acting === r.id}
                      onClick={() => void runApprove(r.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {acting === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      Setujui
                    </button>
                    <button
                      type="button"
                      disabled={acting === r.id}
                      onClick={() => {
                        setRejectId(r.id);
                        setRejectDraft("");
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
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
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="font-semibold text-slate-800">Tolak pengajuan</h2>
            <textarea
              value={rejectDraft}
              onChange={(e) => setRejectDraft(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Alasan untuk staff (min. 5 karakter)"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRejectId(null)} className="rounded-xl border px-4 py-2 text-sm">
                Batal
              </button>
              <button
                type="button"
                disabled={acting === rejectId || rejectDraft.trim().length < 5}
                onClick={() => void runReject()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Kirim
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Data dari koleksi <code className="rounded bg-slate-100 px-1 text-slate-600">{FIELD_ACTIVITY_COLLECTION}</code>.
      </p>
    </div>
  );
}
