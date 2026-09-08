"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  createHrEmployeeOption,
  deactivateHrEmployeeOption,
  optionValuesSet,
  type EmployeeSelectOption,
  type HrOptionCategory,
} from "@/lib/hr-employee-options";
import { getErrorMessage } from "@/lib/errors";

const FORM_CONTROL =
  "w-full min-w-0 max-w-full min-h-[2.75rem] rounded-xl border border-slate-300 bg-white px-3 py-3 text-base leading-snug outline-none transition-colors " +
  "text-slate-900 placeholder:text-slate-500 hover:border-slate-400 " +
  "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 " +
  "md:min-h-0 md:text-sm " +
  "[-webkit-tap-highlight-color:transparent]";

export type HrManageableSelectLabels = {
  addNew: string;
  add: string;
  remove: string;
  newPlaceholder: string;
  optionExists: string;
  addFailed: string;
  removeFailed: string;
  removeConfirm: string;
  legacySuffix: string;
  emptyOptional: string;
  emptyRequired: string;
  search: string;
  noResults: string;
  cancel: string;
};

type Props = {
  category: HrOptionCategory;
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  options: EmployeeSelectOption[];
  onOptionsChange: () => void | Promise<void>;
  canManage?: boolean;
  placeholder?: string;
  optional?: boolean;
  labels: HrManageableSelectLabels;
};

export function HrManageableSelectField({
  category,
  label,
  hint,
  value,
  onChange,
  options,
  onOptionsChange,
  canManage = false,
  placeholder,
  optional = false,
  labels,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const known = useMemo(() => optionValuesSet(options), [options]);
  const isLegacy = Boolean(value && !known.has(value));

  const emptyLabel = placeholder || (optional ? labels.emptyOptional : labels.emptyRequired);

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    const hit = options.find((o) => o.value === value);
    if (hit) return hit.label;
    if (isLegacy) return `${value} ${labels.legacySuffix}`;
    return value;
  }, [value, options, isLegacy, labels.legacySuffix]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setQuery("");
        setLocalError("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open && !adding) {
      searchRef.current?.focus();
    }
  }, [open, adding]);

  const closePanel = () => {
    setOpen(false);
    setAdding(false);
    setQuery("");
    setNewName("");
    setLocalError("");
  };

  const selectValue = (next: string) => {
    onChange(next);
    closePanel();
  };

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (options.some((o) => o.value.toLowerCase() === trimmed.toLowerCase())) {
      setLocalError(labels.optionExists);
      return;
    }
    setBusy(true);
    setLocalError("");
    try {
      const created = await createHrEmployeeOption(category, trimmed);
      await onOptionsChange();
      onChange(created.value);
      closePanel();
    } catch (err) {
      setLocalError(getErrorMessage(err, labels.addFailed));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(labels.removeConfirm.replace("{name}", name))) return;
    setBusy(true);
    setLocalError("");
    try {
      await deactivateHrEmployeeOption(category, name);
      await onOptionsChange();
      if (value === name) onChange("");
    } catch (err) {
      setLocalError(getErrorMessage(err, labels.removeFailed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0" ref={rootRef}>
      <label className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
        <span className="min-w-0 break-words">{label}</span>
        {hint ? (
          <span
            className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-400 text-[11px] font-semibold leading-none text-slate-500"
            title={hint}
            aria-label={hint}
            role="img"
          >
            ?
          </span>
        ) : null}
      </label>

      <div className="relative mt-1 min-w-0">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            if (open) closePanel();
          }}
          className={`${FORM_CONTROL} flex items-center justify-between gap-2 text-left ${
            !value ? "text-slate-400" : "text-slate-800"
          }`}
        >
          <span className="min-w-0 truncate">{selectedLabel || emptyLabel}</span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open ? (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {!adding ? (
              <>
                <div className="border-b border-slate-100 p-2">
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={labels.search}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <ul className="max-h-52 overflow-y-auto py-1" role="listbox">
                  {optional ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => selectValue("")}
                        className={`flex w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                          !value ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-500"
                        }`}
                      >
                        {labels.emptyOptional}
                      </button>
                    </li>
                  ) : null}

                  {isLegacy ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => selectValue(value)}
                        className={`flex w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                          value ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-800"
                        }`}
                      >
                        {value} {labels.legacySuffix}
                      </button>
                    </li>
                  ) : null}

                  {filtered.map((o) => (
                    <li key={o.value}>
                      <div
                        className={`group flex items-center gap-1 hover:bg-slate-50 ${
                          value === o.value ? "bg-indigo-50" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => selectValue(o.value)}
                          className={`min-w-0 flex-1 px-3 py-2.5 text-left text-sm ${
                            value === o.value ? "font-medium text-indigo-700" : "text-slate-800"
                          }`}
                        >
                          {o.label}
                        </button>
                        {canManage ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => void handleRemove(o.value, e)}
                            className="mr-2 shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-50"
                            title={labels.remove}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}

                  {filtered.length === 0 ? (
                    <li className="px-3 py-4 text-center text-sm text-slate-400">{labels.noResults}</li>
                  ) : null}
                </ul>

                {canManage ? (
                  <div className="border-t border-slate-100 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(true);
                        setQuery("");
                        setLocalError("");
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      <Plus className="h-4 w-4" />
                      {labels.addNew}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">{labels.addNew}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setNewName("");
                      setLocalError("");
                    }}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label={labels.cancel}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      setLocalError("");
                    }}
                    placeholder={labels.newPlaceholder}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAdd();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setAdding(false);
                        setNewName("");
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={busy || !newName.trim()}
                    onClick={() => void handleAdd()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {labels.add}
                  </button>
                </div>
                {localError ? <p className="mt-2 text-xs text-red-600">{localError}</p> : null}
              </div>
            )}

            {!adding && localError ? (
              <p className="border-t border-slate-100 px-3 py-2 text-xs text-red-600">{localError}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
