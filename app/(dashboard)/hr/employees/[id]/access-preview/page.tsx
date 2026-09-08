"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { hasEmployeeCapability } from "@/lib/capabilities/employee";
import { canAccessEmployeeManagement } from "@/lib/capabilities/web-access";
import { hrApiFetchAccessPreview } from "@/lib/hr/hr-api-client";
import { useLocale } from "@/components/LocaleProvider";

type PreviewData = {
  user: {
    name: string;
    email: string;
    role_code: string | null;
    account_type: string;
    status: string;
    dashboard_access: boolean;
  };
  legal_entity?: {
    memberships: Array<{
      company_id: string;
      name: string;
      code?: string;
      entity_type?: string;
      is_primary: boolean;
    }>;
    primary_entity_id: string | null;
  };
  organization?: {
    department?: string;
    division?: string;
    position?: string;
    manager_user_id?: string | null;
    manager_name?: string | null;
  };
  work?: {
    office_id?: string | null;
    office_name?: string | null;
  };
  profile: {
    position?: string;
    division?: string;
    department?: string;
    manager_user_id?: string | null;
    manager_name?: string | null;
  };
  company_scope: { actor_company_ids: string[]; label: string };
  capabilities: { mobile: string[]; employee: string[]; approval: string[] };
  sensitive_data_access: boolean;
  scopes: Array<{ capability: string; scope: string }>;
  mobile_access: Array<{ label: string; enabled: boolean }>;
  restricted: string[];
};

export default function EmployeeAccessPreviewPage() {
  const { t } = useLocale();
  const params = useParams();
  const router = useRouter();
  const userId = params?.id as string;

  const authUser = pb.authStore.model as Record<string, unknown> | null;
  const canView =
    canAccessEmployeeManagement(authUser) &&
    hasEmployeeCapability(authUser, "employee.view");

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canView || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = (await hrApiFetchAccessPreview(userId)) as PreviewData;
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat preview.");
    } finally {
      setLoading(false);
    }
  }, [canView, userId]);

  useEffect(() => {
    if (!canView) {
      router.replace("/hr/employees");
      return;
    }
    void load();
  }, [canView, load, router]);

  if (!canView) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Access Preview</h1>
          <p className="text-sm text-slate-500">
            Pratinjau read-only — tidak mengubah permission atau login sebagai user.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/hr/employees/${userId}`)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t("hr.common.back")}
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {preview && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Legal Entity</h2>
            {preview.legal_entity?.memberships?.length ? (
              <ul className="space-y-1 text-sm">
                {preview.legal_entity.memberships.map((m) => (
                  <li key={m.company_id}>
                    {m.name}
                    {m.is_primary ? " (utama)" : ""}
                    {m.entity_type ? ` — ${m.entity_type}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Belum ada keanggotaan entitas.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Organization</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Departemen</dt><dd className="font-medium">{preview.organization?.department || preview.profile.department || "—"}</dd></div>
              <div><dt className="text-slate-500">Divisi</dt><dd className="font-medium">{preview.organization?.division || preview.profile.division || "—"}</dd></div>
              <div><dt className="text-slate-500">Jabatan</dt><dd className="font-medium">{preview.organization?.position || preview.profile.position || "—"}</dd></div>
              <div><dt className="text-slate-500">Atasan</dt><dd className="font-medium">{preview.organization?.manager_name || preview.profile.manager_name || "—"}</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Work</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Kantor</dt><dd className="font-medium">{preview.work?.office_name || "—"}</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Security</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Nama</dt><dd className="font-medium">{preview.user.name}</dd></div>
              <div><dt className="text-slate-500">Email</dt><dd className="font-medium">{preview.user.email}</dd></div>
              <div><dt className="text-slate-500">Role</dt><dd className="font-medium">{preview.user.role_code || "owner"}</dd></div>
              <div><dt className="text-slate-500">Account type</dt><dd className="font-medium">{preview.user.account_type}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd className="font-medium">{preview.user.status}</dd></div>
              <div><dt className="text-slate-500">Dashboard access</dt><dd className="font-medium">{preview.user.dashboard_access ? "Ya" : "Tidak"}</dd></div>
              <div><dt className="text-slate-500">Actor company scope</dt><dd className="font-medium">{preview.company_scope.label}</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Sensitive data</h2>
            <p className="text-sm text-slate-700">
              {preview.sensitive_data_access
                ? "✓ Target memiliki employee.view_sensitive"
                : "✕ Data sensitif tidak tersedia untuk role ini"}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Approval capabilities</h2>
            <div className="flex flex-wrap gap-2">
              {preview.capabilities.approval.length === 0 ? (
                <span className="text-sm text-slate-500">Tidak ada</span>
              ) : (
                preview.capabilities.approval.map((c) => (
                  <span key={c} className="rounded-lg bg-amber-50 px-2 py-1 font-mono text-xs text-amber-900">{c}</span>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Mobile access</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {preview.mobile_access.map((row) => (
                <li key={row.label} className="flex items-center gap-2 text-sm">
                  <span className={row.enabled ? "text-green-600" : "text-slate-400"}>{row.enabled ? "✓" : "✕"}</span>
                  <span>{row.label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Employee capabilities</h2>
            <div className="flex flex-wrap gap-2">
              {preview.capabilities.employee.map((c) => (
                <span key={c} className="rounded-lg bg-indigo-50 px-2 py-1 font-mono text-xs text-indigo-800">{c}</span>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Mobile capabilities</h2>
            <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
              {preview.capabilities.mobile.map((c) => (
                <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">{c}</span>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Restricted</h2>
            {preview.restricted.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada pembatasan tambahan.</p>
            ) : (
              <ul className="list-inside list-disc text-sm text-slate-700">
                {preview.restricted.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
