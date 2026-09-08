"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";

type Period = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  description?: string;
};

type Assignment = {
  id: string;
  subject: string;
  reviewer_count: number;
  assignment_method: string;
  status: string;
  expand?: { subject?: { id: string; name?: string; email?: string }; period?: Period };
};

function authHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

export default function HrRatingPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<{ id: string; name?: string; email?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [periodName, setPeriodName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [reviewerCount, setReviewerCount] = useState(3);
  const [method, setMethod] = useState<"smart_random" | "manual">("smart_random");
  const [manualIds, setManualIds] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pRes, uRes] = await Promise.all([
        fetch("/api/hr/rating/periods", { headers: authHeaders() }),
        pb.collection("users").getFullList({ sort: "name", requestKey: null }),
      ]);
      const pJson = await pRes.json();
      if (!pRes.ok) throw new Error(pJson.error || "Gagal load period");
      setPeriods(pJson.items || []);
      setUsers(uRes.map((u) => ({ id: u.id, name: u.name, email: u.email })));
      if (!selectedPeriod && pJson.items?.[0]?.id) {
        setSelectedPeriod(pJson.items[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load gagal");
    }
  }, [selectedPeriod]);

  const loadAssignments = useCallback(async (periodId: string) => {
    if (!periodId) return;
    const res = await fetch(`/api/hr/rating/assignments?period=${encodeURIComponent(periodId)}`, {
      headers: authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Gagal load assignment");
      return;
    }
    setAssignments(json.items || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedPeriod) void loadAssignments(selectedPeriod);
  }, [selectedPeriod, loadAssignments]);

  async function createPeriod() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/rating/periods", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: periodName,
          start_date: periodStart,
          end_date: periodEnd,
          status: "open",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal buat period");
      setPeriodName("");
      await load();
      if (json.data?.id) setSelectedPeriod(json.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function createAssignment() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        period_id: selectedPeriod,
        subject_user_id: subjectId,
        reviewer_count: reviewerCount,
        method,
      };
      if (method === "manual") {
        body.manual_reviewer_ids = manualIds
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      const res = await fetch("/api/hr/rating/assignments", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal buat assignment");
      await loadAssignments(selectedPeriod);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">HR Rating</h1>
          <p className="text-sm text-slate-600">
            Satu subject → banyak reviewer. Smart Random default.
          </p>
        </div>
        <Link href="/hr/rating/my-result" className="text-sm text-indigo-700 underline">
          Hasil saya
        </Link>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-800">Buat period</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Nama period"
            value={periodName}
            onChange={(e) => setPeriodName(e.target.value)}
          />
          <input
            type="date"
            className="rounded border px-3 py-2 text-sm"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
          <input
            type="date"
            className="rounded border px-3 py-2 text-sm"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void createPeriod()}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Simpan period
          </button>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-800">Assignment (Smart Random / Manual)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Period
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.status})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Subject
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Pilih karyawan</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email || u.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Jumlah reviewer
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded border px-3 py-2"
              value={reviewerCount}
              onChange={(e) => setReviewerCount(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Metode
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={method}
              onChange={(e) => setMethod(e.target.value as "smart_random" | "manual")}
            >
              <option value="smart_random">Smart Random</option>
              <option value="manual">Manual (exception)</option>
            </select>
          </label>
        </div>
        {method === "manual" && (
          <label className="mt-3 block text-sm">
            Manual reviewer IDs (pisah koma)
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={manualIds}
              onChange={(e) => setManualIds(e.target.value)}
            />
          </label>
        )}
        <button
          type="button"
          disabled={busy || !selectedPeriod || !subjectId}
          onClick={() => void createAssignment()}
          className="mt-4 rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Buat assignment
        </button>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-800">Assignments</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-3">Subject</th>
                <th className="py-2 pr-3">Reviewers</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">
                    {a.expand?.subject?.name || a.expand?.subject?.email || a.subject}
                  </td>
                  <td className="py-2 pr-3">{a.reviewer_count}</td>
                  <td className="py-2 pr-3">{a.assignment_method}</td>
                  <td className="py-2 pr-3">{a.status}</td>
                  <td className="py-2">
                    <Link className="text-indigo-700 underline" href={`/hr/rating/assignments/${a.id}`}>
                      Buka
                    </Link>
                  </td>
                </tr>
              ))}
              {!assignments.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Belum ada assignment
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex gap-4 text-sm">
          <Link href="/hr/rating/tasks" className="text-indigo-700 underline">
            Tugas reviewer saya
          </Link>
        </div>
      </section>
    </div>
  );
}
