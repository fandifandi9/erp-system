"use client";

import type { Store } from "@/lib/bisnis/types";

type Props = {
  stores: Store[];
  value: string;
  onChange: (storeId: string) => void;
  shownCount: number;
  totalCount: number;
  noun: string;
  /** Di dalam toolbar tabel — tanpa kotak abu terpisah. */
  embedded?: boolean;
  /** Tampilkan hanya ringkasan, hanya dropdown, atau keduanya (default). */
  part?: "all" | "summary" | "select";
};

export function StoreScopeFilter({
  stores,
  value,
  onChange,
  shownCount,
  totalCount,
  noun,
  embedded,
  part = "all",
}: Props) {
  const storeName = stores.find((s) => s.id === value)?.name;
  const showSummary = part === "all" || part === "summary";
  const showSelect = part === "all" || part === "select";

  const summary = (
    <p className="text-sm text-slate-600">
      {value ? (
        <>
          Menampilkan <strong>{shownCount}</strong> dari <strong>{totalCount}</strong> {noun} — toko{" "}
          <strong>{storeName}</strong>
        </>
      ) : (
        <>
          Menampilkan <strong>{totalCount}</strong> {noun} dari <strong>semua toko</strong>
        </>
      )}
      {value && shownCount < totalCount ? (
        <span className="mt-1 block text-xs text-slate-500">
          Data toko lain disembunyikan oleh filter. Pilih &quot;Semua toko&quot; untuk melihat lengkap.
        </span>
      ) : null}
    </p>
  );

  const select = (
    <label className="flex shrink-0 items-center gap-2 text-sm">
      <span className="whitespace-nowrap text-slate-500">Filter toko</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
      >
        <option value="">Semua toko</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );

  if (part === "summary") {
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        {summary}
      </div>
    );
  }

  if (part === "select") {
    return (
      <div className={embedded ? "ml-auto flex shrink-0" : "flex shrink-0"}>
        {select}
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "ml-auto flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center"
          : "mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      {showSummary ? summary : null}
      {showSelect ? select : null}
    </div>
  );
}
