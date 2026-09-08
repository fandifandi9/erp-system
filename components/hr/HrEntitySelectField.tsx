"use client";

import { useCallback, useEffect, useState } from "react";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";
import { hasMasterDataCapability } from "@/lib/capabilities/master-data";
import { pb } from "@/lib/pocketbase";

export type LegalEntityOption = {
  id: string;
  company_name: string;
  legal_name?: string;
  code?: string;
  entity_type?: string;
};

type HrEntitySelectFieldProps = {
  label?: string;
  hint?: string;
  value: string;
  onChange: (entityId: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Server-resolved capability override (Staff + module assignment). */
  allowView?: boolean;
  allowAssign?: boolean;
};

export function HrEntitySelectField({
  label = "Entitas Administratif",
  hint = "Digunakan untuk administrasi, payroll, dan dokumen karyawan. Bukan struktur operasional.",
  value,
  onChange,
  required = true,
  disabled = false,
  allowView,
  allowAssign,
}: HrEntitySelectFieldProps) {
  const authUser = pb.authStore.model as Record<string, unknown> | null;
  const canView =
    allowView === true || hasMasterDataCapability(authUser, "master_data.entity.view");
  const canAssign =
    allowAssign === true || hasMasterDataCapability(authUser, "master_data.membership.assign");

  const [options, setOptions] = useState<LegalEntityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readOnlyLabel, setReadOnlyLabel] = useState("");

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/master-data/legal-entities?assignableOnly=true", {
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: LegalEntityOption[];
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const list = json.data || [];
      setOptions(list);
      if (value) {
        const found = list.find((o) => o.id === value);
        if (found) {
          setReadOnlyLabel(
            `${found.company_name}${found.code ? ` (${found.code})` : ""}${found.entity_type ? ` — ${found.entity_type}` : ""}`,
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat entitas.");
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [canView, value]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-select when actor has exactly one assignable entity (Staff HR common case).
  useEffect(() => {
    if (!canView || loading || value || options.length !== 1) return;
    const only = options[0];
    if (!only?.id) return;
    onChange(only.id);
    setReadOnlyLabel(
      `${only.company_name}${only.code ? ` (${only.code})` : ""}${only.entity_type ? ` — ${only.entity_type}` : ""}`,
    );
  }, [canView, loading, value, options, onChange]);

  if (!canView) return null;

  if (!canAssign) {
    return (
      <div className="min-w-0">
        <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
        {hint ? <p className="mb-1 text-xs text-slate-500">{hint}</p> : null}
        <input
          type="text"
          disabled
          value={readOnlyLabel || (loading ? "Memuat…" : "—")}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600"
        />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      {hint ? <p className="mb-1 text-xs text-slate-500">{hint}</p> : null}
      <select
        value={value}
        disabled={disabled || loading}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
      >
        <option value="">— Pilih entitas —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.company_name}
            {o.code ? ` (${o.code})` : ""}
            {o.entity_type ? ` — ${o.entity_type}` : ""}
          </option>
        ))}
      </select>
      {loading ? <p className="mt-1 text-xs text-slate-400">Memuat entitas…</p> : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
