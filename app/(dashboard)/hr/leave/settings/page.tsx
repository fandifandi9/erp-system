"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { fetchHrEmployeeOptions } from "@/lib/hr-employee-options";
import { Building2, Loader2, Plus, Trash2, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { canAccessHrWebSurface } from "@/lib/access/hr-web-access";

interface DivisionQuota {
  id: string;
  division: string;
  max_people_per_day: number;
}

export default function DivisionQuotaSettingsPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [quotas, setQuotas] = useState<DivisionQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [newQuota, setNewQuota] = useState({
    division: "",
    max_people_per_day: 2,
  });

  const [divisionOptions, setDivisionOptions] = useState<{ value: string; label: string }[]>([]);

  const currentUser = pb.authStore.model;
  const hasAccess = canAccessHrWebSurface(
    currentUser as Record<string, unknown> | null,
    "/hr/leave/settings",
  );

  const fetchQuotas = async () => {
    setLoading(true);
    try {
      const result = await pb.collection("division_quotas").getFullList({
        sort: "division",
        requestKey: null,
      });
      setQuotas(result as unknown as DivisionQuota[]);
    } catch (err) {
      console.error("Fetch quotas error:", err);
      setError(t("hr.leave.quotaSettings.fetchFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    void fetchQuotas();
    void fetchHrEmployeeOptions("division").then(setDivisionOptions);
  }, [hasAccess]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!newQuota.division.trim()) {
      setError(t("hr.leave.quotaSettings.divisionRequired"));
      return;
    }

    if (newQuota.max_people_per_day < 1) {
      setError(t("hr.leave.quotaSettings.minOne"));
      return;
    }

    const exists = quotas.some((q) => q.division.toLowerCase() === newQuota.division.toLowerCase());
    if (exists) {
      setError(t("hr.leave.quotaSettings.divisionExists"));
      return;
    }

    setSaving("new");
    try {
      await pb.collection("division_quotas").create(newQuota);
      setSuccess(t("hr.leave.quotaSettings.created"));
      setNewQuota({ division: "", max_people_per_day: 2 });
      await fetchQuotas();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("hr.leave.quotaSettings.createFailed"));
    } finally {
      setSaving(null);
    }
  };

  const handleUpdate = async (quotaId: string, maxPeople: number) => {
    if (maxPeople < 1) {
      alert(t("hr.leave.quotaSettings.minOne"));
      return;
    }

    setSaving(quotaId);
    setError("");
    setSuccess("");

    try {
      await pb.collection("division_quotas").update(quotaId, {
        max_people_per_day: maxPeople,
      });
      setSuccess(t("hr.leave.quotaSettings.updated"));
      await fetchQuotas();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("hr.leave.quotaSettings.updateFailed"));
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (quotaId: string, division: string) => {
    if (!confirm(t("hr.leave.quotaSettings.deleteConfirm", { division }))) return;

    setSaving(quotaId);
    setError("");
    setSuccess("");

    try {
      await pb.collection("division_quotas").delete(quotaId);
      setSuccess(t("hr.leave.quotaSettings.deleted"));
      await fetchQuotas();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("hr.leave.quotaSettings.deleteFailed"));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {t("hr.common.accessDeniedHrOwner")}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push("/hr/leave")}
          className="rounded-lg p-2 transition hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">{t("hr.leave.quotaSettings.title")}</h1>
          <p className="mt-1 text-slate-500">{t("hr.leave.quotaSettings.subtitle")}</p>
        </div>
      </div>

      <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-yellow-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
          <div className="flex-1">
            <p className="mb-1 font-semibold text-orange-900">{t("hr.leave.quotaSettings.flowTitle")}</p>
            <ul className="space-y-1 text-sm text-orange-700">
              <li>• {t("hr.leave.quotaSettings.flow1")}</li>
              <li>• {t("hr.leave.quotaSettings.flow2")}</li>
              <li>• {t("hr.leave.quotaSettings.flow3")}</li>
              <li>• {t("hr.leave.quotaSettings.flow4")}</li>
              <li>• {t("hr.leave.quotaSettings.flow5")}</li>
            </ul>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t("hr.leave.quotaSettings.errorLabel")}</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700">
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t("hr.leave.quotaSettings.successLabel")}</p>
            <p className="text-sm">{success}</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Plus className="h-5 w-5 text-indigo-600" />
          {t("hr.leave.quotaSettings.addTitle")}
        </h2>
        <form onSubmit={handleCreate} className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <select
            value={newQuota.division}
            onChange={(e) => setNewQuota({ ...newQuota, division: e.target.value })}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            required
          >
            <option value="" disabled>
              {t("hr.leave.quotaSettings.selectDivision")}
            </option>
            {divisionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            max="10"
            value={newQuota.max_people_per_day}
            onChange={(e) =>
              setNewQuota({ ...newQuota, max_people_per_day: parseInt(e.target.value, 10) })
            }
            className="w-32 rounded-xl border border-slate-300 px-4 py-3 text-center focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            required
          />
          <button
            type="submit"
            disabled={saving === "new"}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === "new" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("hr.common.saving")}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                {t("hr.leave.quotaSettings.add")}
              </>
            )}
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">{t("hr.leave.quotaSettings.addHint")}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Building2 className="h-5 w-5 text-indigo-600" />
          {t("hr.leave.quotaSettings.listTitle", { count: quotas.length })}
        </h2>

        {quotas.length === 0 ? (
          <div className="py-12 text-center">
            <Building2 className="mx-auto mb-4 h-16 w-16 text-slate-300" />
            <p className="mb-2 text-slate-600">{t("hr.leave.quotaSettings.emptyTitle")}</p>
            <p className="text-sm text-slate-400">{t("hr.leave.quotaSettings.emptyDesc")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {quotas.map((quota) => (
              <div
                key={quota.id}
                className="rounded-xl border border-slate-200 p-4 transition hover:border-indigo-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-1 items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
                      <Building2 className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{quota.division}</p>
                      <p className="text-sm text-slate-500">
                        {t("hr.leave.quotaSettings.maxPerDay", { count: quota.max_people_per_day })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={quota.max_people_per_day}
                      onChange={(e) => handleUpdate(quota.id, parseInt(e.target.value, 10))}
                      className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-center focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                      disabled={saving === quota.id}
                    />
                    <button
                      type="button"
                      onClick={() => void handleDelete(quota.id, quota.division)}
                      disabled={saving === quota.id}
                      className="rounded-lg p-2 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={t("hr.leave.quotaSettings.delete")}
                    >
                      {saving === quota.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Trash2 className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <p className="mb-2 font-medium text-slate-800">{t("hr.leave.quotaSettings.defaultTitle")}</p>
        <p>{t("hr.leave.quotaSettings.defaultDesc")}</p>
      </div>
    </div>
  );
}
