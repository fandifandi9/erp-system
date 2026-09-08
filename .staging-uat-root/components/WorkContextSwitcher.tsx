"use client";

import { Building2, Store, Warehouse, Loader2 } from "lucide-react";
import { useWorkContext } from "@/components/WorkContextProvider";

export function WorkContextSwitcher() {
  const { context, loading, companies, stores, storeWarehouses, setContext } = useWorkContext();

  if (loading && !context) {
    return (
      <div className="hidden items-center gap-1 text-slate-400 sm:flex">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    );
  }

  if (companies.length === 0 && stores.length === 0) return null;

  const showCompanySwitcher = companies.length > 1;
  const showStoreSwitcher = stores.length > 1;
  const showWarehouseSwitcher = storeWarehouses.length > 1;

  if (!showCompanySwitcher && !showStoreSwitcher && !showWarehouseSwitcher) return null;

  return (
    <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
      {showCompanySwitcher ? (
        <div className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-blue-600" />
          <select
            aria-label="Entitas aktif"
            className="max-w-[7rem] truncate bg-transparent text-xs font-medium text-slate-700 outline-none sm:max-w-[9rem]"
            value={context?.companyId ?? ""}
            onChange={(e) => void setContext({ companyId: e.target.value })}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {showStoreSwitcher ? (
        <div className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
          <Store className="h-3.5 w-3.5 shrink-0 text-violet-600" />
          <select
            aria-label="Toko aktif"
            className="max-w-[8rem] truncate bg-transparent text-xs font-medium text-slate-700 outline-none sm:max-w-[10rem]"
            value={context?.storeId ?? ""}
            onChange={(e) => void setContext({ storeId: e.target.value })}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {showWarehouseSwitcher ? (
        <div className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
          <Warehouse className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <select
            aria-label="Gudang aktif"
            className="max-w-[8rem] truncate bg-transparent text-xs font-medium text-slate-700 outline-none sm:max-w-[10rem]"
            value={context?.warehouseId ?? ""}
            onChange={(e) => void setContext({ warehouseId: e.target.value })}
          >
            {storeWarehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
