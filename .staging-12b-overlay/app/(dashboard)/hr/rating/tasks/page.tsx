"use client";

import { useEffect, useState } from "react";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";

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
  const [items, setItems] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [aspects, setAspects] = useState<Array<{ id: string; name: string }>>([]);
  const [scores, setScores] = useState<Record<string, { score: number; comment: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/hr/rating/my-tasks", { headers: ratingAuthHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Gagal");
        return;
      }
      setItems(json.items || []);
    })();
  }, []);

  async function openTask(id: string) {
    setActiveId(id);
    setMsg(null);
    const res = await fetch(`/api/hr/rating/tasks/${id}`, { headers: ratingAuthHeaders() });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error || "Gagal");
      return;
    }
    const asps = (json.aspects || []) as Array<{ id: string; name: string }>;
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
    setMsg(res.ok ? "Draft tersimpan" : json.error || "Gagal");
  }

  async function submit() {
    if (!activeId) return;
    await saveDraft();
    const res = await fetch(`/api/hr/rating/tasks/${activeId}`, {
      method: "POST",
      headers: ratingAuthHeaders(),
      body: JSON.stringify({ action: "submit" }),
    });
    const json = await res.json();
    setMsg(res.ok ? "Terkirim & terkunci" : json.error || "Gagal");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tugas reviewer saya</h1>
      {error && <p className="text-red-600">{error}</p>}
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id} className="rounded border bg-white p-3 text-sm">
            <p className="font-medium">
              {t.expand?.assignment?.expand?.period?.name || "Period"} →{" "}
              {t.expand?.assignment?.expand?.subject?.name ||
                t.expand?.assignment?.expand?.subject?.email ||
                "Subject"}
            </p>
            <p className="text-slate-500">{t.status}</p>
            <button
              type="button"
              className="mt-2 text-indigo-700 underline"
              onClick={() => void openTask(t.id)}
            >
              Isi penilaian
            </button>
          </li>
        ))}
      </ul>

      {activeId && (
        <div className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Form penilaian</h2>
          {aspects.map((a) => (
            <div key={a.id} className="border-b border-slate-100 pb-3">
              <p className="text-sm font-medium">{a.name}</p>
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
              <textarea
                className="mt-2 w-full rounded border px-2 py-1 text-sm"
                placeholder="Komentar (opsional)"
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
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveDraft()}
              className="rounded border px-3 py-2 text-sm"
            >
              Simpan draft
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
            >
              Submit & kunci
            </button>
          </div>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
        </div>
      )}
    </div>
  );
}
