"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { useLocale } from "@/components/LocaleProvider";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";
import {
  progressHelperText,
  translateRatingApiError,
  translateRatingLabel,
  translateRatingMethod,
} from "@/lib/hr/rating-ui";

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
  const { t } = useLocale();
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
      setError(translateRatingApiError(pJson.error, t, "hr.rating.assignments.loadError"));
      return;
    }
    setPeriods(pJson.items || []);
    setUsers(uRes.map((u) => ({ id: u.id, name: u.name, email: u.email })));
    if (!selectedPeriod && pJson.items?.[0]?.id) setSelectedPeriod(pJson.items[0].id);
  }, [selectedPeriod, t]);

  const loadAssignments = useCallback(async (periodId: string) => {
    if (!periodId) return;
    const res = await fetch(`/api/hr/rating/assignments?period=${encodeURIComponent(periodId)}`, {
      headers: ratingAuthHeaders(),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(translateRatingApiError(json.error, t, "hr.rating.assignments.loadError"));
      return;
    }
    setAssignments(json.items || []);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (selectedPeriod) void loadAssignments(selectedPeriod);
  }, [selectedPeriod, loadAssignments]);

  async function runPreview() {
    if (!selectedPeriod || !subjectId) {
      setError(t("hr.rating.errors.required"));
      return;
    }
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
      setError(translateRatingApiError(json.error, t, "hr.rating.assignments.previewError"));
      return;
    }
    setPreview(json.data);
  }

  async function createAssignment() {
    if (!selectedPeriod || !subjectId) {
      setError(t("hr.rating.errors.required"));
      return;
    }
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
      if (!res.ok) throw new Error(json.error || t("hr.rating.assignments.createError"));
      await loadAssignments(selectedPeriod);
    } catch (e) {
      setError(translateRatingApiError(e instanceof Error ? e.message : "", t, "hr.rating.assignments.createError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("hr.rating.assignments.title")}</h1>
        <p className="text-sm text-slate-600">{t("hr.rating.assignments.subtitle")}</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="rounded border bg-white p-4 space-y-3">
        <h2 className="font-semibold">{t("hr.rating.assignments.createTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            {t("hr.rating.assignments.period")}
            <p className="mt-0.5 text-xs text-slate-500">{t("hr.rating.assignments.periodHelp")}</p>
            <select className="mt-1 w-full rounded border px-3 py-2" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({translateRatingLabel(t, "status", p.status)})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {t("hr.rating.assignments.subject")}
            <p className="mt-0.5 text-xs text-slate-500">{t("hr.rating.assignments.subjectHelp")}</p>
            <select className="mt-1 w-full rounded border px-3 py-2" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">{t("hr.rating.assignments.subjectPlaceholder")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email || u.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {t("hr.rating.assignments.reviewerCount")}
            <p className="mt-0.5 text-xs text-slate-500">{t("hr.rating.assignments.reviewerCountHelp")}</p>
            <p className="text-xs text-slate-500">{t("hr.rating.assignments.reviewerCountExample")}</p>
            <input type="number" min={1} className="mt-1 w-full rounded border px-3 py-2" value={reviewerCount} onChange={(e) => setReviewerCount(Number(e.target.value))} />
          </label>
          <label className="text-sm">
            {t("hr.rating.assignments.method")}
            <p className="mt-0.5 text-xs text-slate-500">{t("hr.rating.assignments.methodHelp")}</p>
            <select className="mt-1 w-full rounded border px-3 py-2" value={method} onChange={(e) => setMethod(e.target.value as "smart_random" | "manual")}>
              <option value="smart_random">{t("hr.rating.assignments.smartRandom")}</option>
              <option value="manual">{t("hr.rating.assignments.manual")}</option>
            </select>
            {method === "smart_random" ? (
              <p className="mt-1 text-xs text-slate-500">{t("hr.rating.assignments.smartRandomHelp")}</p>
            ) : null}
          </label>
        </div>
        {method === "manual" && (
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder={t("hr.rating.assignments.manualPlaceholder")}
            value={manualIds}
            onChange={(e) => setManualIds(e.target.value)}
          />
        )}
        <div className="flex gap-2">
          <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void runPreview()}>
            {t("hr.rating.assignments.preview")}
          </button>
          <button
            type="button"
            disabled={busy || !selectedPeriod || !subjectId || (preview != null && !preview.sufficient && method === "smart_random")}
            onClick={() => void createAssignment()}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("hr.rating.assignments.create")}
          </button>
        </div>
        {preview && (
          <div className={`rounded border p-3 text-sm ${preview.sufficient ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
            <p>
              {t("hr.rating.assignments.requested")}: {preview.requested}
            </p>
            <p>
              {t("hr.rating.assignments.eligible")}: {preview.eligible_count}
            </p>
            <p>
              {t("hr.rating.assignments.selected")}: {preview.will_select}
            </p>
            <p className="mt-1 text-slate-600">
              {t("hr.rating.assignments.previewHelp", {
                eligible: preview.eligible_count,
                willSelect: preview.will_select,
              })}
            </p>
            {preview.warning && (
              <p className="mt-1 font-medium text-amber-800">
                {translateRatingApiError(preview.warning, t, "hr.rating.errors.insufficient")}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="font-semibold">{t("hr.rating.assignments.listTitle")}</h2>
        {assignments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">{t("hr.rating.assignments.empty")}</p>
        ) : (
          <table className="mt-3 min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-3">{t("hr.rating.assignments.colSubject")}</th>
                <th className="py-2 pr-3">{t("hr.rating.assignments.colRequested")}</th>
                <th className="py-2 pr-3">{t("hr.rating.assignments.colEligible")}</th>
                <th className="py-2 pr-3">{t("hr.rating.assignments.colSelected")}</th>
                <th className="py-2 pr-3">{t("hr.rating.assignments.colCompleted")}</th>
                <th className="py-2 pr-3">{t("hr.rating.assignments.colMethod")}</th>
                <th className="py-2 pr-3">{t("hr.rating.assignments.colStatus")}</th>
                <th className="py-2">{t("hr.rating.assignments.colDetail")}</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{a.expand?.subject?.name || a.expand?.subject?.email || a.subject}</td>
                  <td className="py-2 pr-3">{a.progress?.requested ?? a.reviewer_count}</td>
                  <td className="py-2 pr-3">{a.progress?.eligible ?? "—"}</td>
                  <td className="py-2 pr-3">{a.progress?.selected ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {a.progress?.completed_label ?? "—"}
                    {a.progress ? (
                      <p className="text-xs text-slate-500">
                        {progressHelperText(t, a.progress.completed, a.progress.selected)}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{translateRatingMethod(t, a.assignment_method)}</td>
                  <td className="py-2 pr-3">{translateRatingLabel(t, "status", a.progress?.status_label || a.status)}</td>
                  <td className="py-2">
                    <Link className="text-indigo-700 underline" href={`/hr/rating/assignments/${a.id}`}>
                      {t("hr.rating.assignments.open")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
