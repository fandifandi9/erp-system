"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";
import { translateRatingApiError, translateRatingLabel } from "@/lib/hr/rating-ui";

type Period = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
};

const STATUSES = ["draft", "open", "in_progress", "closed", "cancelled"] as const;

export default function HrRatingPeriodsPage() {
  const { t } = useLocale();
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
      setError(translateRatingApiError(json.error, t, "hr.rating.periods.loadError"));
      return;
    }
    setItems(json.items || []);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!name.trim() || !start || !end) {
      setError(t("hr.rating.errors.required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/rating/periods", {
        method: "POST",
        headers: ratingAuthHeaders(),
        body: JSON.stringify({ name, start_date: start, end_date: end, status: "draft" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("hr.rating.periods.createError"));
      setName("");
      await load();
    } catch (e) {
      setError(translateRatingApiError(e instanceof Error ? e.message : "", t, "hr.rating.periods.createError"));
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
      if (!res.ok) throw new Error(json.error || t("hr.rating.periods.statusError"));
      await load();
    } catch (e) {
      setError(translateRatingApiError(e instanceof Error ? e.message : "", t, "hr.rating.periods.statusError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("hr.rating.periods.title")}</h1>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <section className="rounded border bg-white p-4 space-y-3">
        <h2 className="font-semibold">{t("hr.rating.periods.createTitle")}</h2>
        <p className="text-sm text-slate-600">{t("hr.rating.periods.createHelp")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            {t("hr.rating.periods.name")}
            <p className="mt-0.5 text-xs text-slate-500">{t("hr.rating.periods.nameHelp")}</p>
            <input
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              placeholder={t("hr.rating.periods.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="text-sm">
            {t("hr.rating.periods.start")}
            <p className="mt-0.5 text-xs text-slate-500">{t("hr.rating.periods.startHelp")}</p>
            <input type="date" className="mt-1 w-full rounded border px-3 py-2 text-sm" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="text-sm">
            {t("hr.rating.periods.end")}
            <p className="mt-0.5 text-xs text-slate-500">{t("hr.rating.periods.endHelp")}</p>
            <input type="date" className="mt-1 w-full rounded border px-3 py-2 text-sm" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button type="button" disabled={busy} onClick={() => void create()} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("hr.rating.periods.save")}
            </button>
          </div>
        </div>
      </section>
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">{t("hr.rating.periods.empty")}</p>
      ) : (
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2 pr-3">{t("hr.rating.periods.name")}</th>
              <th className="py-2 pr-3">{t("hr.rating.periods.status")}</th>
              <th className="py-2">{t("hr.rating.periods.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const locked = p.status === "closed" || p.status === "cancelled";
              return (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{p.name}</td>
                  <td className="py-2 pr-3">{translateRatingLabel(t, "status", p.status)}</td>
                  <td className="py-2">
                    <select
                      disabled={busy || locked}
                      className="rounded border px-2 py-1 text-sm"
                      value={p.status}
                      onChange={(e) => void setStatus(p.id, e.target.value)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {translateRatingLabel(t, "status", s)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
