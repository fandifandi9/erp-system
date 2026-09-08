"use client";

import { useCallback, useEffect, useState } from "react";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";
import { hasEmployeeCapability } from "@/lib/capabilities/employee";
import { pb } from "@/lib/pocketbase";

export type ManagerCandidateOption = {
  userId: string;
  name: string;
  email: string;
  roleCode: string | null;
};

type HrManagerPickerFieldProps = {
  label: string;
  hint?: string;
  value: string;
  onChange: (userId: string) => void;
  excludeUserId?: string;
  disabled?: boolean;
  emptyLabel?: string;
  /** Server-resolved capability override (Staff + module assignment). */
  allowAssign?: boolean;
};

export function HrManagerPickerField({
  label,
  hint,
  value,
  onChange,
  excludeUserId,
  disabled = false,
  emptyLabel = "— Tidak ada atasan —",
  allowAssign,
}: HrManagerPickerFieldProps) {
  const authUser = pb.authStore.model as Record<string, unknown> | null;
  const canAssign =
    allowAssign === true || hasEmployeeCapability(authUser, "employee.assign_manager");

  const [options, setOptions] = useState<ManagerCandidateOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canAssign) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (excludeUserId) qs.set("exclude", excludeUserId);
      const res = await fetch(`/api/hr/employees/manager-candidates?${qs.toString()}`, {
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: ManagerCandidateOption[];
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setOptions(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar atasan.");
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [canAssign, excludeUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canAssign) {
    return null;
  }

  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {hint ? <p className="mb-1 text-xs text-slate-500">{hint}</p> : null}
      <select
        value={value}
        disabled={disabled || loading}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.userId} value={o.userId}>
            {o.name}
            {o.roleCode ? ` (${o.roleCode})` : ""}
            {o.email ? ` — ${o.email}` : ""}
          </option>
        ))}
      </select>
      {loading ? <p className="mt-1 text-xs text-slate-400">Memuat kandidat atasan…</p> : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
