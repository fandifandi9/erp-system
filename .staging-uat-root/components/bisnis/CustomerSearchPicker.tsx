"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { Customer } from "@/lib/bisnis/types";
import {
  customerDisplayLabel,
  filterCustomersLocal,
} from "@/lib/bisnis/customer-lookup";
import { onEnterFocusNext } from "@/lib/bisnis/form-nav";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  customers: Customer[];
  value: string;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
  onAddNew: () => void;
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

  const pick = (c: Customer) => {
    setQuery(customerDisplayLabel(c));
    setOpen(false);
    onSelect(c);
  };

  return (
    <div ref={wrapRef} className="relative flex min-w-0 flex-1 gap-1">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
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
        {open && hits.length > 0 ? (
          <ul className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
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
        ) : null}
        {open && query.trim() && hits.length === 0 ? (
          <div className="absolute z-30 mt-1 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("sales.customerPicker.notFound")}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onAddNew}
        title={t("sales.customerPicker.addNewTitle")}
        className="shrink-0 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1.5 text-indigo-700 transition hover:bg-indigo-100"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
