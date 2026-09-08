"use client";

/**
 * HR Workspace — Izin/Off approval queue (separate from field_activity).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle, XCircle, Filter } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { canAccess } from "@/lib/rbac";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";

type Row = {
  id: string;
  type?: string;
  start_date?: string;
  end_date?: string;
  reason?: string;
  status?: string;
  rejection_reason?: string;
  expand?: { user?: { name?: string; email?: string } };
};

export default function HrAbsenceRequestsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [acting, setActing] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectDraft, setRejectDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const current = pb.authStore.model;
  const hasAccess = !!current && canAccess(current, "/hr/izin-off");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        filter === "pending"
          ? "pendingForApprover=1"
          : filter === "all"
            ? "status=pending"
            : `status=${encodeURIComponent(filter)}`;
      const res = await fetch(`/api/hr/absence-requests?${qs}`, {
        credentials: "include",
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json()) as { ok?: boolean; items?: Row[]; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal memuat");
      setRows(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    void load();
  }, [hasAccess, load]);

  const pendingCount = useMemo(
    () => rows.filter((r) => String(r.status) === "pending").length,
    [rows],
  );

  async function approve(id: string) {
    setActing(id);
    try {
      const res = await fetch(`/api/hr/absence-requests/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        credentials: "include",
        headers: hrApiAuthHeaders(),
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyetujui");
    } finally {
      setActing(null);
    }
  }

  async function reject(id: string) {
    setActing(id);
    try {
      const res = await fetch(`/api/hr/absence-requests/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        credentials: "include",
        headers: hrApiAuthHeaders(),
        body: JSON.stringify({ reason: rejectDraft }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal");
      setRejectId(null);
      setRejectDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menolak");
    } finally {
      setActing(null);
    }
  }

  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-slate-600">Akses Off ditolak (capability/modul).</div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Off</h1>
        <p className="text-sm text-slate-500">
          Workflow tidak masuk kerja — terpisah dari Aktivitas Lapangan (kerja di luar kantor).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-slate-400" />
        {(["pending", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {f}
            {f === "pending" ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Tidak ada pengajuan.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const name = r.expand?.user?.name || r.expand?.user?.email || "—";
            const range =
              String(r.start_date ?? "").slice(0, 10) === String(r.end_date ?? "").slice(0, 10)
                ? String(r.start_date ?? "").slice(0, 10)
                : `${String(r.start_date ?? "").slice(0, 10)} – ${String(r.end_date ?? "").slice(0, 10)}`;
            return (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{name}</p>
                    <p className="text-xs text-slate-500">
                      {String(r.type ?? "izin").toUpperCase()} · {range} · {r.status}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{r.reason || "—"}</p>
                    {r.rejection_reason ? (
                      <p className="mt-1 text-xs text-rose-600">Tolak: {r.rejection_reason}</p>
                    ) : null}
                  </div>
                  {String(r.status) === "pending" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={acting === r.id}
                        onClick={() => void approve(r.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Setujui
                      </button>
                      <button
                        type="button"
                        disabled={acting === r.id}
                        onClick={() => {
                          setRejectId(r.id);
                          setRejectDraft("");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Tolak
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rejectId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <h2 className="font-semibold text-slate-900">Alasan penolakan</h2>
            <textarea
              className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-sm"
              rows={3}
              value={rejectDraft}
              onChange={(e) => setRejectDraft(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="text-sm text-slate-600" onClick={() => setRejectId(null)}>
                Batal
              </button>
              <button
                type="button"
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm text-white"
                onClick={() => void reject(rejectId)}
              >
                Tolak
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
