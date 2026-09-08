"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { EvidencePicker } from "@/components/hr/EvidencePicker";
import { ReportingModuleNav } from "@/components/hr/ReportingModuleNav";
import { reportingAuthHeaders, reportingFetch } from "@/lib/hr/reporting-client";
import { pb } from "@/lib/pocketbase";
import { canAccessHrWebSurface } from "@/lib/access/hr-web-access";
import type { ReportingAttachmentMeta, ReportingCase } from "@/lib/hr/reporting-types";

export function ReportingDetailPage({ kind }: { kind: "report" | "finding" }) {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");
  const api = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  const [data, setData] = useState<ReportingCase | null>(null);
  const [attachments, setAttachments] = useState<ReportingAttachmentMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await reportingFetch(`${api}/${id}`, { headers: reportingAuthHeaders(false) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(json.error || t("hr.reporting.errors.generic")));
        return;
      }
      setData(json.data);
      setAttachments(json.attachments || []);
      setNote(String(json.data?.hr_note || ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("hr.reporting.offline"));
    }
  }

  useEffect(() => {
    if (id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function closeCase() {
    setBusy(true);
    try {
      const res = await reportingFetch(`${api}/${id}/close`, {
        method: "POST",
        headers: reportingAuthHeaders(),
        body: JSON.stringify({ hr_note: note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(json.error || t("hr.reporting.errors.generic")));
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("hr.reporting.offline"));
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="p-4 text-sm text-slate-600">{t("hr.common.saving")}</p>;

  const draft = data.status === "draft";
  const canHrAct = canAccessHrWebSurface(
    pb.authStore.model as Record<string, unknown> | null,
    kind === "finding" ? "/hr/findings" : "/hr/reports",
  );

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-4">
      <ReportingModuleNav />
      <h1 className="text-xl font-semibold text-slate-900">{data.title}</h1>
      <p className="text-sm text-slate-600">
        {t(`hr.reporting.categories.${data.category}`)} · {t(`hr.reporting.status.${data.status}`)} ·{" "}
        {t(`hr.reporting.priorities.${data.priority}`)}
      </p>
      {data.location_text ? (
        <p className="text-sm text-slate-600">
          {t("hr.reporting.location")}: {data.location_text}
        </p>
      ) : null}
      <p className="whitespace-pre-wrap text-base leading-6 text-slate-800">{data.body}</p>

      <EvidencePicker
        kind={kind}
        parentId={id}
        items={attachments}
        onChange={setAttachments}
        ensureDraft={async () => id}
        disabled={!draft}
      />

      {data.hr_note ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {t("hr.reporting.hrNote")}: {data.hr_note}
        </p>
      ) : null}

      {canHrAct && data.status !== "closed" ? (
        <div className="space-y-2 rounded-xl border p-3">
          <label className="block text-sm font-medium">
            {t("hr.reporting.hrNote")}
            <textarea
              className="mt-1 min-h-20 w-full rounded-lg border px-3 py-2 text-base"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void closeCase()}
            className="min-h-12 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium"
          >
            {t("hr.reporting.close")}
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
