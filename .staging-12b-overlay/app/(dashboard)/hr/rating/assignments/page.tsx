"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";

type Period = { id: string; name: string; status: string };
type Progress = {
  requested: number;
  eligible: number | null;
  selected: number;
  completed: number;
  completed_label: string;
  respondents_label: string;
  status_label: string;
};
type Assignment = {
  id: string;
  subject: string;
  reviewer_count: number;
  assignment_method: string;
  status: string;
  created?: string;
  progress?: Progress;
  expand?: { subject?: { name?: string; email?: string } };
};

export default function HrRatingAssignmentsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<{ id: string; name?: string; email?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [reviewerCount, setReviewerCount] = useState(4);
  const [method, setMethod] = useState<"smart_random" | "manual">("smart_random");
  const [manualIds, setManualIds] = useState("");
  const [preview, setPreview] = useState<{
    eligible_count: number;
    requested: number;
    sufficient: boolean;
    warning: string | null;
    will_select: number;
    tiers?: { department: number; division: number; office: number };
  } | null>(null);

  const load = useCallback(async () => {
    const [pRes, uRes] = await Promise.all([
      fetch("/api/hr/rating/periods", { headers: ratingAuthHeaders() }),
      pb.collection("users").getFullList({ sort: "name", requestKey: null }),
    ]);
    const pJson = await pRes.json();
    if (!pRes.ok) {
      setError(pJson.error || "Gagal load period");
      return;
    }
    setPeriods(pJson.items || []);
    setUsers(uRes.map((u) => ({ id: u.id, name: u.name, email: u.email })));
    if (!selectedPeriod && pJson.items?.[0]?.id) setSelectedPeriod(pJson.items[0].id);
  }, [selectedPeriod]);

  const loadAssignments = useCallback(async (periodId: string) => {
    if (!periodId) return;
    const res = await fetch(`/api/hr/rating/assignments?period=${encodeURIComponent(periodId)}`, {
      headers: ratingAuthHeaders(),
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

  async function runPreview() {
    if (!selectedPeriod || !subjectId) return;
    setError(null);
    const qs = new URLSearchParams({
      period_id: selectedPeriod,
      subject_user_id: subjectId,
      reviewer_count: String(reviewerCount),
    });
    const res = await fetch(`/api/hr/rating/preview?${qs}`, { headers: ratingAuthHeaders() });
    const json = await res.json();
    if (!res.ok) {
      setPreview(null);
      setError(json.error || "Preview gagal");
      return;
    }
    setPreview(json.data);
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
        body.manual_reviewer_ids = manualIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      }
      const res = await fetch("/api/hr/rating/assignments", {
        method: "POST",
        headers: ratingAuthHeaders(),
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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Assignment penilaian</h1>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="rounded border bg-white p-4 space-y-3">
        <h2 className="font-semibold">Buat assignment</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            1. Period
            <select className="mt-1 w-full rounded border px-3 py-2" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.status})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            2. Subject
            <select className="mt-1 w-full rounded border px-3 py-2" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Pilih karyawan</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email || u.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            3. Jumlah reviewer
            <input type="number" min={1} className="mt-1 w-full rounded border px-3 py-2" value={reviewerCount} onChange={(e) => setReviewerCount(Number(e.target.value))} />
          </label>
          <label className="text-sm">
            4. Metode
            <select className="mt-1 w-full rounded border px-3 py-2" value={method} onChange={(e) => setMethod(e.target.value as "smart_random" | "manual")}>
              <option value="smart_random">Smart Random (default)</option>
              <option value="manual">Manual (exception)</option>
            </select>
          </label>
        </div>
        {method === "manual" && (
          <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Manual reviewer IDs" value={manualIds} onChange={(e) => setManualIds(e.target.value)} />
        )}
        <div className="flex gap-2">
          <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void runPreview()}>
            5. Preview eligible
          </button>
          <button
            type="button"
            disabled={busy || !selectedPeriod || !subjectId || (preview != null && !preview.sufficient && method === "smart_random")}
            onClick={() => void createAssignment()}
            className="rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            6. Create assignment
          </button>
        </div>
        {preview && (
          <div className={`rounded border p-3 text-sm ${preview.sufficient ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
            <p>Subject dipilih. Requested: {preview.requested}</p>
            <p>Eligible reviewers: {preview.eligible_count}</p>
            <p>Smart Random akan memilih: {preview.will_select}</p>
            {preview.tiers && (
              <p className="text-xs text-slate-600">
                Tier: dept {preview.tiers.department} · div {preview.tiers.division} · office {preview.tiers.office}
              </p>
            )}
            {preview.warning && <p className="mt-1 font-medium text-amber-800">{preview.warning}</p>}
          </div>
        )}
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="font-semibold">Daftar assignment</h2>
        <table className="mt-3 min-w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2 pr-3">Subject</th>
              <th className="py-2 pr-3">Requested</th>
              <th className="py-2 pr-3">Eligible</th>
              <th className="py-2 pr-3">Selected</th>
              <th className="py-2 pr-3">Completed</th>
              <th className="py-2 pr-3">Method</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="py-2 pr-3">{a.expand?.subject?.name || a.expand?.subject?.email || a.subject}</td>
                <td className="py-2 pr-3">{a.progress?.requested ?? a.reviewer_count}</td>
                <td className="py-2 pr-3">{a.progress?.eligible ?? "—"}</td>
                <td className="py-2 pr-3">{a.progress?.selected ?? "—"}</td>
                <td className="py-2 pr-3">{a.progress?.completed_label ?? "—"}</td>
                <td className="py-2 pr-3">{a.assignment_method}</td>
                <td className="py-2 pr-3">{a.progress?.status_label || a.status}</td>
                <td className="py-2">
                  <Link className="text-indigo-700 underline" href={`/hr/rating/assignments/${a.id}`}>
                    Buka
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
