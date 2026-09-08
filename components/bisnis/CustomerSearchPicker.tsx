"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Customer } from "@/lib/bisnis/types";
import {
  customerDisplayLabel,
  filterCustomersLocal,
  findLocalCustomerByExactName,
} from "@/lib/bisnis/customer-lookup";
import { onEnterFocusNext } from "@/lib/bisnis/form-nav";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  customers: Customer[];
  value: string;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
  /** Teks pencarian saat ini diteruskan agar form tambah bisa diisi nama. */
  onAddNew: (suggestedName?: string) => void;
  inputClassName?: string;
};

export function CustomerSearchPicker({
  customers,
  value,
  onSelect,
  onClear,
  onAddNew,
  inputClassName = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm",
}: Props) {
  const { t } = useLocale();
  const selected = customers.find((c) => c.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) setQuery(customerDisplayLabel(selected));
    else if (!value) setQuery("");
  }, [selected, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = useMemo(
    () => filterCustomersLocal(customers, query),
    [customers, query],
  );

  const q = query.trim();
  const exactMatch = useMemo(
    () => (q.length >= 2 ? findLocalCustomerByExactName(customers, q) : null),
    [customers, q],
  );
  /** Hanya boleh tambah jika nama exact belum ada. */
  const canAddNew = q.length >= 2 && !exactMatch;

  const pick = (c: Customer) => {
    setQuery(customerDisplayLabel(c));
    setOpen(false);
    onSelect(c);
  };

  const openAddNew = (name?: string) => {
    const suggested = name?.trim();
    if (!suggested || findLocalCustomerByExactName(customers, suggested)) return;
    setOpen(false);
    onAddNew(suggested);
  };

  const showPanel = open && (hits.length > 0 || q.length > 0);

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-2 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        data-nav
        data-customer-search
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          if (selected && v.trim() !== customerDisplayLabel(selected).trim()) {
            onClear();
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onEnterFocusNext}
        placeholder={t("sales.customerPicker.searchPlaceholder")}
        className={`${inputClassName} pl-7`}
      />
      {showPanel ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {hits.length > 0 ? (
            <ul className="max-h-44 overflow-y-auto py-1">
              {hits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(c)}
                  >
                    <span className="font-medium text-slate-900">{c.name}</span>
                    {c.phone ? (
                      <span className="ml-2 font-mono text-xs text-slate-500">{c.phone}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t("sales.customerPicker.notFound")}
            </div>
          )}
          {canAddNew ? (
            <button
              type="button"
              className="w-full border-t border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => openAddNew(q)}
            >
              {t("sales.customerPicker.addAsNew", { name: q })}
            </button>
          ) : exactMatch && q ? (
            <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              {t("sales.customerPicker.nameExists", { name: q })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
