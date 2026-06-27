"use client";

import type { CompanyProfile } from "@/lib/bisnis/types";

type Props = {
  companies: CompanyProfile[];
  value: string;
  onChange: (companyId: string) => void;
  shownCount: number;
  totalCount: number;
  noun: string;
};

export function EntityScopeFilter({
  companies,
  value,
  onChange,
  shownCount,
  totalCount,
  noun,
}: Props) {
  const companyName = companies.find((c) => c.id === value)?.company_name;

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        {value ? (
          <>
            Menampilkan <strong>{shownCount}</strong> dari <strong>{totalCount}</strong> {noun} — entitas{" "}
            <strong>{companyName}</strong>
          </>
        ) : (
          <>
            Menampilkan <strong>{totalCount}</strong> {noun} dari <strong>semua entitas</strong>
          </>
        )}
        {value && shownCount < totalCount ? (
          <span className="mt-1 block text-xs text-slate-500">
            Modul entitas lain disembunyikan oleh filter — bukan data hilang. Pilih &quot;Semua entitas&quot; untuk
            melihat lengkap.
          </span>
        ) : null}
      </p>
      <label className="flex shrink-0 items-center gap-2 text-sm">
        <span className="whitespace-nowrap text-slate-500">Filter entitas</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Semua entitas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ? `${c.code} — ` : ""}
              {c.company_name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function companyNameById(companies: CompanyProfile[], id?: string): string | undefined {
  if (!id) return undefined;
  return companies.find((c) => c.id === id)?.company_name;
}
