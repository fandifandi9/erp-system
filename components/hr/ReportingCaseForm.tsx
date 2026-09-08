"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { EvidencePicker } from "@/components/hr/EvidencePicker";
import { reportingAuthHeaders, reportingFetch } from "@/lib/hr/reporting-client";
import type { ReportingAttachmentMeta } from "@/lib/hr/reporting-types";

type Kind = "report" | "finding";

const REPORT_CATS = ["facility", "safety", "other"] as const;
const FINDING_CATS = ["safety", "misconduct", "operations", "other"] as const;

type Props = {
  kind: Kind;
  initialId?: string | null;
};

export function ReportingCaseForm({ kind, initialId = null }: Props) {
  const { t } = useLocale();
  const router = useRouter();
  const base = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  const listHref = kind === "finding" ? "/hr/findings" : "/hr/reports";
  const cats = kind === "finding" ? FINDING_CATS : REPORT_CATS;

  const [id, setId] = useState<string | null>(initialId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>(cats[0]);
  const [priority, setPriority] = useState("medium");
  const [location, setLocation] = useState("");
  const [attachments, setAttachments] = useState<ReportingAttachmentMeta[]>([]);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ensureDraft = useCallback(async () => {
    if (id) return id;
    const titleTrim = title.trim();
    const bodyTrim = body.trim();
    if (!titleTrim || !bodyTrim) {
      setFieldError({
        title: titleTrim ? "" : t("hr.reporting.errors.required"),
        body: bodyTrim ? "" : t("hr.reporting.errors.required"),
      });
      throw new Error(t("hr.reporting.errors.required"));
    }
    const res = await reportingFetch(base, {
      method: "POST",
      headers: reportingAuthHeaders(),
      body: JSON.stringify({
        title: titleTrim,
        body: bodyTrim,
        category,
        priority,
        location_text: location,
        submit: false,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(json.error || t("hr.reporting.offline")));
    const newId = String(json.id || json.data?.id);
    setId(newId);
    return newId;
  }, [id, title, body, category, priority, location, base, t]);

  async function submit() {
    setMsg(null);
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = t("hr.reporting.errors.required");
    if (!body.trim()) errs.body = t("hr.reporting.errors.required");
    setFieldError(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const caseId = await ensureDraft();
      const patch = await reportingFetch(`${base}/${caseId}`, {
        method: "PATCH",
        headers: reportingAuthHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          priority,
          location_text: location,
        }),
      });
      if (!patch.ok) {
        const json = await patch.json().catch(() => ({}));
        setMsg(String(json.error || t("hr.reporting.errors.generic")));
        return;
      }
      const res = await reportingFetch(`${base}/${caseId}/submit`, {
        method: "POST",
        headers: reportingAuthHeaders(),
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(String(json.error || t("hr.reporting.errors.generic")));
        return;
      }
      router.push(`${listHref}/${caseId}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("hr.reporting.offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mx-auto flex w-full max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="block text-sm font-medium text-slate-800">
        {t("hr.reporting.titleField")}
        <input
          className="mt-1 min-h-12 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={180}
        />
        {fieldError.title ? <span className="mt-1 block text-sm text-red-600">{fieldError.title}</span> : null}
      </label>

      <label className="block text-sm font-medium text-slate-800">
        {t("hr.reporting.category")}
        <select
          className="mt-1 min-h-12 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {cats.map((c) => (
            <option key={c} value={c}>
              {t(`hr.reporting.categories.${c}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-slate-800">
        {t("hr.reporting.priority")}
        <select
          className="mt-1 min-h-12 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          {["low", "medium", "high"].map((p) => (
            <option key={p} value={p}>
              {t(`hr.reporting.priorities.${p}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-slate-800">
        {t("hr.reporting.location")}
        <span className="block text-xs font-normal text-slate-500">{t("hr.reporting.locationHelp")}</span>
        <input
          className="mt-1 min-h-12 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>

      <label className="block text-sm font-medium text-slate-800">
        {t("hr.reporting.bodyField")}
        <textarea
          className="mt-1 min-h-32 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {fieldError.body ? <span className="mt-1 block text-sm text-red-600">{fieldError.body}</span> : null}
      </label>

      <EvidencePicker
        kind={kind}
        parentId={id}
        items={attachments}
        onChange={setAttachments}
        ensureDraft={ensureDraft}
        disabled={busy}
      />

      <button
        type="submit"
        disabled={busy}
        className="min-h-12 w-full rounded-lg bg-indigo-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {t("hr.reporting.submit")}
      </button>
      {msg ? <p className="text-sm text-red-600">{msg}</p> : null}
    </form>
  );
}
