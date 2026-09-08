"use client";

import { useCallback, useEffect, useState } from "react";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";

type Period = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
};

const STATUSES = ["draft", "open", "in_progress", "closed", "cancelled"] as const;

export default function HrRatingPeriodsPage() {
  const [items, setItems] = useState<Period[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/hr/rating/periods", { headers: ratingAuthHeaders() });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Gagal load");
      return;
    }
    setItems(json.items || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/rating/periods", {
        method: "POST",
        headers: ratingAuthHeaders(),
        body: JSON.stringify({ name, start_date: start, end_date: end, status: "draft" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal buat period");
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/rating/periods/${id}`, {
        method: "PATCH",
        headers: ratingAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal ubah status");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Periode penilaian</h1>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <section className="rounded border bg-white p-4">
        <h2 className="font-semibold">Buat period (draft)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <input className="rounded border px-3 py-2 text-sm" placeholder="Nama" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="date" className="rounded border px-3 py-2 text-sm" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="date" className="rounded border px-3 py-2 text-sm" value={end} onChange={(e) => setEnd(e.target.value)} />
          <button type="button" disabled={busy} onClick={() => void create()} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
            Simpan
          </button>
        </div>
      </section>
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b text-slate-500">
            <th className="py-2 pr-3">Nama</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const locked = p.status === "closed" || p.status === "cancelled";
            return (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2 pr-3">{p.name}</td>
                <td className="py-2 pr-3">{p.status}</td>
                <td className="py-2">
                  <select
                    disabled={busy || locked}
                    className="rounded border px-2 py-1 text-sm"
                    value={p.status}
                    onChange={(e) => void setStatus(p.id, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
