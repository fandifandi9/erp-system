"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";
import { translateAspectName, translateRatingApiError, translateRatingLabel } from "@/lib/hr/rating-ui";

type Task = {
  id: string;
  status: string;
  expand?: {
    assignment?: {
      expand?: {
        subject?: { name?: string; email?: string };
        period?: { name?: string };
      };
    };
  };
};

export default function MyRatingTasksPage() {
  const { t } = useLocale();
  const [items, setItems] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [aspects, setAspects] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [scores, setScores] = useState<Record<string, { score: number; comment: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/hr/rating/my-tasks", { headers: ratingAuthHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(translateRatingApiError(json.error, t, "hr.rating.tasks.loadError"));
        return;
      }
      setItems(json.items || []);
    })();
  }, [t]);

  async function openTask(id: string) {
    setActiveId(id);
    setMsg(null);
    const res = await fetch(`/api/hr/rating/tasks/${id}`, { headers: ratingAuthHeaders() });
    const json = await res.json();
    if (!res.ok) {
      setMsg(translateRatingApiError(json.error, t, "hr.rating.tasks.loadError"));
      return;
    }
    const asps = (json.aspects || []) as Array<{ id: string; name: string; code?: string }>;
    setAspects(asps);
    const next: Record<string, { score: number; comment: string }> = {};
    for (const a of asps) next[a.id] = { score: 3, comment: "" };
    for (const s of json.scores || []) {
      next[String(s.aspect)] = {
        score: Number(s.score),
        comment: String(s.comment || ""),
      };
    }
    setScores(next);
  }

  async function saveDraft() {
    if (!activeId) return;
    const body = {
      scores: Object.entries(scores).map(([aspect_id, v]) => ({
        aspect_id,
        score: v.score,
        comment: v.comment,
      })),
    };
    const res = await fetch(`/api/hr/rating/tasks/${activeId}`, {
      method: "PUT",
      headers: ratingAuthHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setMsg(
      res.ok
        ? t("hr.rating.tasks.draftSaved")
        : translateRatingApiError(json.error, t, "hr.rating.errors.generic"),
    );
  }

  async function submit() {
    if (!activeId) return;
    const missing = aspects.some((a) => {
      const n = Number(scores[a.id]?.score);
      return !Number.isFinite(n) || n < 1 || n > 5;
    });
    if (missing) {
      setMsg(t("hr.rating.errors.incompleteAspects"));
      return;
    }
    await saveDraft();
    const res = await fetch(`/api/hr/rating/tasks/${activeId}`, {
      method: "POST",
      headers: ratingAuthHeaders(),
      body: JSON.stringify({ action: "submit" }),
    });
    const json = await res.json();
    setMsg(
      res.ok
        ? t("hr.rating.tasks.submitted")
        : translateRatingApiError(json.error, t, "hr.rating.errors.incompleteAspects"),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("hr.rating.tasks.title")}</h1>
        <p className="text-sm text-slate-600">{t("hr.rating.tasks.subtitle")}</p>
        <p className="mt-1 text-sm text-slate-600">{t("hr.rating.tasks.instruction")}</p>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {items.length === 0 && !error ? (
        <p className="text-sm text-slate-600">{t("hr.rating.tasks.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((task) => (
            <li key={task.id} className="rounded border bg-white p-3 text-sm">
              <p className="font-medium">
                {task.expand?.assignment?.expand?.period?.name || t("hr.rating.assignments.period")} →{" "}
                {task.expand?.assignment?.expand?.subject?.name ||
                  task.expand?.assignment?.expand?.subject?.email ||
                  t("hr.rating.assignments.subject")}
              </p>
              <p className="text-slate-500">{translateRatingLabel(t, "status", task.status)}</p>
              <button
                type="button"
                className="mt-2 text-indigo-700 underline"
                onClick={() => void openTask(task.id)}
              >
                {t("hr.rating.tasks.openForm")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeId && (
        <div className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">{t("hr.rating.tasks.formTitle")}</h2>
          <p className="text-sm text-slate-600">{t("hr.rating.tasks.formInstruction")}</p>
          <p className="text-sm text-slate-600">{t("hr.rating.tasks.scoreHelp")}</p>
          <p className="text-xs text-slate-500">{t("hr.rating.assignments.scaleTitle")}</p>
          <ul className="text-xs text-slate-500">
            {["1", "2", "3", "4", "5"].map((n) => (
              <li key={n}>{t(`hr.rating.scale.${n}`)}</li>
            ))}
          </ul>
          {aspects.map((a) => (
            <div key={a.id} className="border-b border-slate-100 pb-3">
              <p className="text-sm font-medium">{translateAspectName(t, a.code, a.name)}</p>
              <input
                type="number"
                min={1}
                max={5}
                className="mt-1 w-24 rounded border px-2 py-1"
                value={scores[a.id]?.score ?? 3}
                onChange={(e) =>
                  setScores((prev) => ({
                    ...prev,
                    [a.id]: {
                      score: Number(e.target.value),
                      comment: prev[a.id]?.comment || "",
                    },
                  }))
                }
              />
              <label className="mt-2 block text-xs text-slate-600">
                {t("hr.rating.tasks.comment")}
                <p className="font-normal text-slate-500">{t("hr.rating.tasks.commentHelp")}</p>
                <textarea
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  placeholder={t("hr.rating.tasks.commentPlaceholder")}
                  value={scores[a.id]?.comment || ""}
                  onChange={(e) =>
                    setScores((prev) => ({
                      ...prev,
                      [a.id]: {
                        score: prev[a.id]?.score ?? 3,
                        comment: e.target.value,
                      },
                    }))
                  }
                />
              </label>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => void saveDraft()} className="rounded border px-3 py-2 text-sm">
              {t("hr.rating.tasks.saveDraft")}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {t("hr.rating.tasks.submit")}
            </button>
          </div>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
        </div>
      )}
    </div>
  );
}
