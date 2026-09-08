"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, UserPlus } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";

type RecruitmentItem = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  orgPositionName: string;
  status: string;
  created: string;
};

export default function RecruitmentApprovalsPage() {
  const [items, setItems] = useState<RecruitmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/recruitment-requests?pendingForApprover=1", {
        credentials: "include",
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        items?: RecruitmentItem[];
        error?: string;
      };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal memuat.");
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/hr/recruitment-requests/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        credentials: "include",
        headers: hrApiAuthHeaders(),
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal menyetujui.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyetujui.");
    } finally {
      setActingId(null);
    }
  }

  async function reject(id: string) {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/hr/recruitment-requests/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        credentials: "include",
        headers: hrApiAuthHeaders(),
        body: JSON.stringify({ reason: rejectReason }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal menolak.");
      setRejectId(null);
      setRejectReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menolak.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <PageShell maxWidth="max-w-3xl">
      <div className="mb-4">
        <Link href="/dashboard-staff" className="text-sm text-slate-500 hover:text-sky-700">
          ← Meja Kerja
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
          <UserPlus className="h-6 w-6" />
          Persetujuan Recruitment
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Hanya permohonan yang menunggu otoritas hierarki Anda. Staff HR tidak dapat menyetujui
          permohonannya sendiri.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Memuat…
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Tidak ada recruitment yang menunggu persetujuan Anda.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Recruitment Baru · PENDING
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {item.candidateName || item.candidateEmail || "Kandidat"}
              </p>
              <p className="text-sm text-slate-600">
                Target: <strong>{item.orgPositionName || "—"}</strong>
              </p>
              <p className="mt-1 text-xs text-slate-500">Menunggu persetujuan Anda</p>

              {rejectId === item.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Alasan penolakan…"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    rows={2}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actingId === item.id || !rejectReason.trim()}
                      onClick={() => void reject(item.id)}
                      className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Konfirmasi Tolak
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectId(null);
                        setRejectReason("");
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actingId === item.id}
                    onClick={() => void approve(item.id)}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={actingId === item.id}
                    onClick={() => setRejectId(item.id)}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
