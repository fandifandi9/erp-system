"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Save, Store, Warehouse } from "lucide-react";
import { fetchStores } from "@/lib/bisnis/client";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { useWorkContext } from "@/components/WorkContextProvider";
import { warehousesForStore } from "@/lib/tenant/warehouses-for-store";
import { useLocale } from "@/components/LocaleProvider";

/** Atur entitas, toko & gudang kerja user. */
export function WorkContextSettings() {
  const { t } = useLocale();
  const { context, loading: ctxLoading, companies, setContext } = useWorkContext();
  const [companyId, setCompanyId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [entityStores, setEntityStores] = useState<{ id: string; name: string; default_warehouse?: string; company?: string }[]>([]);
  const [entityWarehouses, setEntityWarehouses] = useState<{ id: string; name: string; code: string; store?: string; company?: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!context) return;
    setCompanyId(context.companyId);
    setStoreId(context.storeId);
    setWarehouseId(context.warehouseId);
  }, [context?.companyId, context?.storeId, context?.warehouseId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, w] = await Promise.all([
          fetchStores(true, companyId),
          pb.collection(INV_COLLECTIONS.warehouses).getFullList<{ id: string; name: string; code: string; store?: string; company?: string }>({
            filter: `is_active = true && company = "${companyId}"`,
            sort: "name",
            requestKey: null,
          }),
        ]);
        if (cancelled) return;
        setEntityStores(s.map((x) => ({ id: x.id, name: x.name, default_warehouse: x.default_warehouse, company: x.company })));
        setEntityWarehouses(w);
      } catch {
        if (!cancelled) setError(t("pengaturan.konteks.errLoad"));
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, t]);

  const scopedWarehouses = warehousesForStore(storeId, entityStores, entityWarehouses);

  useEffect(() => {
    if (!companyId) return;
    if (!entityStores.some((s) => s.id === storeId)) {
      setStoreId(entityStores[0]?.id ?? "");
    }
  }, [companyId, entityStores, storeId]);

  useEffect(() => {
    if (!storeId || scopedWarehouses.some((w) => w.id === warehouseId)) return;
    const store = entityStores.find((s) => s.id === storeId);
    setWarehouseId(store?.default_warehouse || scopedWarehouses[0]?.id || "");
  }, [storeId, scopedWarehouses, warehouseId, entityStores]);

  const save = useCallback(async () => {
    if (!companyId || !storeId || !warehouseId) {
      setError(t("pengaturan.konteks.errSelect"));
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await setContext({ companyId, storeId, warehouseId });
      setMessage(t("pengaturan.konteks.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pengaturan.common.errSave"));
    } finally {
      setSaving(false);
    }
  }, [setContext, companyId, storeId, warehouseId, t]);

  if (ctxLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("pengaturan.konteks.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t("pengaturan.konteks.intro")}</p>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {companies.length > 1 && (
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 flex items-center gap-1 font-medium text-slate-700">
              <Building2 className="h-4 w-4 text-blue-600" />
              Entitas
            </span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ` : ""}{c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-1 font-medium text-slate-700">
            <Store className="h-4 w-4 text-violet-600" />
            {t("pengaturan.konteks.storeLabel")}
          </span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={entityStores.length <= 1}
          >
            {entityStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {entityStores.length <= 1 ? (
            <span className="mt-1 block text-xs text-slate-400">{t("pengaturan.konteks.singleStore")}</span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-1 font-medium text-slate-700">
            <Warehouse className="h-4 w-4 text-emerald-600" />
            {t("pengaturan.konteks.warehouseLabel")}
          </span>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={scopedWarehouses.length <= 1}
          >
            {scopedWarehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {scopedWarehouses.length <= 1 ? (
            <span className="mt-1 block text-xs text-slate-400">{t("pengaturan.konteks.singleWarehouse")}</span>
          ) : null}
        </label>
      </div>

      {(companies.length > 1 || entityStores.length > 1 || scopedWarehouses.length > 1) && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("pengaturan.konteks.saveBtn")}
        </button>
      )}
    </div>
  );
}
