"use client";

/**
 * Staff personal — submit / list / cancel Izin/Off (not field activity).
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";

type Row = {
  id: string;
  type?: string;
  start_date?: string;
  end_date?: string;
  reason?: string;
  status?: string;
  rejection_reason?: string;
  hr_action_name?: string;
};

export default function StaffIzinOffPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [type] = useState<"izin" | "off">("off");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!pb.authStore.isValid) return;
    setLoading(true);
    try {
      const res = await fetch("/api/hr/absence-requests?mine=1", {
        credentials: "include",
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json()) as { ok?: boolean; items?: Row[]; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal memuat");
      setRows(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/hr/absence-requests", {
        method: "POST",
        credentials: "include",
        headers: hrApiAuthHeaders(),
        body: JSON.stringify({
          type,
          start_date: start,
          end_date: end || start,
          reason,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal mengirim");
      setMsg(json.message || "Terkirim");
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    try {
      const res = await fetch(`/api/hr/absence-requests/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: hrApiAuthHeaders(),
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal batal");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal batal");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Off</h1>
        <p className="text-sm text-slate-500">
          Pengajuan tidak masuk kerja. Untuk kerja di luar kantor, gunakan Aktivitas Lapangan. Cuti
          tahunan tetap lewat menu Cuti.
        </p>
      </div>

      <form
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-xs font-medium text-slate-600">Jenis: Off</p>
        <label className="block text-xs font-medium text-slate-600">
          Tanggal mulai
          <input
            type="date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Tanggal selesai
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Alasan
          <textarea
            required
            minLength={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
          />
        </label>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Mengirim…" : "Kirim pengajuan"}
        </button>
      </form>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Pengajuan saya</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada pengajuan.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <p className="font-medium">
                  {(String(r.type ?? "off").toLowerCase() === "off" ? "Off" : "Absen")} ·{" "}
                  {String(r.start_date).slice(0, 10)} · {r.status}
                </p>
                <p className="text-slate-600">{r.reason}</p>
                {r.rejection_reason ? (
                  <p className="text-xs text-rose-600">Ditolak: {r.rejection_reason}</p>
                ) : null}
                {r.hr_action_name ? (
                  <p className="text-xs text-slate-500">Oleh: {r.hr_action_name}</p>
                ) : null}
                {String(r.status) === "pending" ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-rose-700"
                    onClick={() => void cancel(r.id)}
                  >
                    Batalkan
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
