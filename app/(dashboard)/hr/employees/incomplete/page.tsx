"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { canAccessEmployeeManagement } from "@/lib/capabilities/web-access";
import { getIncompleteProfiles, type Profile } from "@/lib/profile";
import { Loader2, AlertTriangle, UserX, Edit } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

export default function IncompleteProfilesPage() {
  const router = useRouter();
  const { t } = useLocale();
  const hasAccess = canAccessEmployeeManagement(pb.authStore.model as Record<string, unknown> | null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const fieldLabels = useMemo(
    () => ({
      position: t("hr.employees.incomplete.fieldPosition"),
      department: t("hr.employees.incomplete.fieldDepartment"),
      salary: t("hr.employees.incomplete.fieldSalary"),
    }),
    [t],
  );

  const loadProfiles = useCallback(async () => {
    if (!hasAccess) return;
    setLoading(true);
    try {
      const result = await getIncompleteProfiles(page, 20);
      setProfiles(result.items);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error("Failed to load incomplete profiles:", error);
    } finally {
      setLoading(false);
    }
  }, [page, hasAccess]);

  useEffect(() => {
    if (!hasAccess) {
      router.replace("/hr/employees");
      return;
    }
    void loadProfiles();
  }, [hasAccess, loadProfiles, router]);

  if (!hasAccess) return null;

  const getMissingFields = (profile: Profile): string[] => {
    const missing: string[] = [];
    if (!profile.position) missing.push(fieldLabels.position);
    if (!profile.department) missing.push(fieldLabels.department);
    if (!profile.salary) missing.push(fieldLabels.salary);
    return missing;
  };

  if (loading && page === 1) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">{t("hr.employees.incomplete.title")}</h1>
          <p className="mt-1 text-slate-500">{t("hr.employees.incomplete.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/hr/employees")}
          className="rounded-xl bg-slate-600 px-4 py-2 text-white transition hover:bg-slate-700"
        >
          {t("hr.employees.incomplete.back")}
        </button>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-center gap-4">
          <AlertTriangle className="h-12 w-12 text-red-600" />
          <div>
            <p className="text-3xl font-bold text-red-800">{profiles.length}</p>
            <p className="text-sm text-red-600">{t("hr.employees.incomplete.statLabel")}</p>
          </div>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <UserX className="mx-auto mb-4 h-16 w-16 text-slate-300" />
          <p className="mb-2 text-slate-600">{t("hr.employees.incomplete.emptyTitle")}</p>
          <p className="text-sm text-slate-400">{t("hr.employees.incomplete.emptyDesc")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    {t("hr.employees.incomplete.colEmployee")}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    {t("hr.employees.incomplete.colEmail")}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    {t("hr.employees.incomplete.colMissing")}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    {t("hr.employees.incomplete.colStatus")}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">
                    {t("hr.employees.incomplete.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {profiles.map((profile) => {
                  const missing = getMissingFields(profile);
                  return (
                    <tr key={profile.id} className="transition hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
                            <span className="font-semibold text-indigo-600">
                              {profile.name?.charAt(0)?.toUpperCase() || "?"}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">
                              {profile.name || t("hr.employees.incomplete.noName")}
                            </p>
                            <p className="text-xs text-slate-500">{profile.department || "-"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{profile.email || "-"}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {missing.map((field) => (
                            <span key={field} className="rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700">
                              {field}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                          {t("hr.employees.incomplete.statusIncomplete")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => router.push(`/hr/employees/${profile.id}/edit`)}
                          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-700"
                        >
                          <Edit className="h-4 w-4" />
                          {t("hr.employees.incomplete.complete")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <p className="text-sm text-slate-600">
                {t("hr.employees.incomplete.pageOf", { page, total: totalPages })}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("hr.employees.incomplete.prev")}
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("hr.employees.incomplete.next")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
        <p className="mb-2 font-medium">{t("hr.employees.incomplete.infoTitle")}</p>
        <ul className="list-inside list-disc space-y-1 text-xs">
          <li>{t("hr.employees.incomplete.info1")}</li>
          <li>{t("hr.employees.incomplete.info2")}</li>
          <li>{t("hr.employees.incomplete.info3")}</li>
        </ul>
      </div>
    </div>
  );
}
