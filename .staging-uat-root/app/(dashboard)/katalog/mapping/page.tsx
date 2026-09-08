"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { CatalogShell } from "@/components/catalog/CatalogShell";
import { WmsCard } from "@/components/wms/ui";
import {
  createMpMappingApi,
  deleteMpMappingApi,
  fetchCatalogChannelAccounts,
  fetchCatalogProducts,
  fetchMpMappings,
  updateMpMappingApi,
} from "@/lib/catalog/client";
import { canEditCatalogPrices } from "@/lib/catalog/catalog-access";
import { fetchStores } from "@/lib/bisnis/client";
import type { Store } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import { pb } from "@/lib/pocketbase";
import { useLocale } from "@/components/LocaleProvider";

type MappingRow = {
  id: string;
  mp_sku: string;
  mp_product_name?: string;
  product: string;
  is_active: boolean;
  store_channel_account?: string;
  expand?: { product?: { id: string; sku: string; name: string } };
};

type ChannelAccount = {
  id: string;
  account_name: string;
  store: string;
  expand?: {
    store?: { name: string };
    channel?: { name: string };
    seller_tier?: { label: string };
  };
};

export default function KatalogMappingPage() {
  const { t } = useLocale();
  const user = pb.authStore.model;
  const canEdit = user ? canEditCatalogPrices(user) : false;

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    mp_sku: "",
    mp_product_name: "",
    product: "",
  });
  const [productHits, setProductHits] = useState<
    Array<{ id: string; sku: string; name: string }>
  >([]);
  const [productQ, setProductQ] = useState("");

  useEffect(() => {
    void fetchStores(true).then((st) => {
      setStores(st);
      if (st[0]) setStoreId((prev) => prev || st[0].id);
    });
  }, []);

  useEffect(() => {
    if (!storeId) return;
    void fetchCatalogChannelAccounts(storeId).then((res) => {
      const items = (res.items ?? []) as ChannelAccount[];
      setAccounts(items);
      setAccountId(items[0]?.id ?? "");
    });
  }, [storeId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchMpMappings({
        storeId: storeId || undefined,
        accountId: accountId || undefined,
        q: q.trim() || undefined,
      });
      setRows(res.items ?? []);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [storeId, accountId, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (productQ.trim().length < 2) {
      setProductHits([]);
      return;
    }
    const t = setTimeout(() => {
      void fetchCatalogProducts({ q: productQ.trim(), perPage: 15, sellableOnly: true }).then(
        (res) => setProductHits(res.items.map((p) => ({ id: p.id, sku: p.sku, name: p.name }))),
      );
    }, 280);
    return () => clearTimeout(t);
  }, [productQ]);

  const submitMapping = async () => {
    if (!accountId) {
      setError(t("catalog.mapping.errSelectAccount"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createMpMappingApi({
        store_channel_account: accountId,
        mp_sku: form.mp_sku.trim(),
        mp_product_name: form.mp_product_name.trim() || undefined,
        product: form.product,
      });
      setForm({ mp_sku: "", mp_product_name: "", product: "" });
      setProductQ("");
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: MappingRow) => {
    try {
      await updateMpMappingApi(row.id, { is_active: !row.is_active });
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const remove = async (row: MappingRow) => {
    if (!window.confirm(t("catalog.mapping.confirmDelete", { sku: row.mp_sku }))) return;
    try {
      await deleteMpMappingApi(row.id);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const selectedProduct = productHits.find((p) => p.id === form.product);

  return (
    <InventoryShell title="" subtitle="" module="wms">
      <CatalogShell
        title={t("catalog.mapping.title")}
        subtitle={t("catalog.mapping.subtitle")}
      >
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <WmsCard>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[160px]">
              <label className="mb-0.5 block text-xs font-medium text-slate-600">{t("catalog.mapping.store")}</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-0.5 block text-xs font-medium text-slate-600">
                {t("catalog.mapping.mpAccount")}
              </label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.length === 0 ? (
                  <option value="">{t("catalog.mapping.noAccount")}</option>
                ) : (
                  accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_name}
                      {a.expand?.channel?.name ? ` · ${a.expand.channel.name}` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-0.5 block text-xs font-medium text-slate-600">{t("catalog.mapping.filterSku")}</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                  placeholder={t("catalog.mapping.filterSkuPlaceholder")}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
          </div>
        </WmsCard>

        {canEdit && accountId ? (
          <WmsCard className="border-indigo-200 bg-indigo-50/30">
            <h3 className="text-sm font-semibold text-slate-900">{t("catalog.mapping.addMapping")}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-slate-600">{t("catalog.mapping.colMpSku")}</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  value={form.mp_sku}
                  onChange={(e) => setForm((f) => ({ ...f, mp_sku: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-slate-600">
                  {t("catalog.mapping.mpProductName")}
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={form.mp_product_name}
                  onChange={(e) => setForm((f) => ({ ...f, mp_product_name: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-0.5 block text-xs font-medium text-slate-600">
                  {t("catalog.mapping.serbaProduct")}
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder={t("catalog.mapping.searchProduct")}
                  value={productQ}
                  onChange={(e) => setProductQ(e.target.value)}
                />
                {productHits.length > 0 && !selectedProduct ? (
                  <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
                    {productHits.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-1.5 text-left hover:bg-indigo-50"
                          onClick={() => {
                            setForm((f) => ({ ...f, product: p.id }));
                            setProductQ(`${p.sku} — ${p.name}`);
                            setProductHits([]);
                          }}
                        >
                          <span className="font-mono text-xs text-indigo-700">{p.sku}</span>{" "}
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {selectedProduct ? (
                  <p className="mt-1 text-xs text-emerald-800">
                    {t("catalog.mapping.selected", { sku: selectedProduct.sku, name: selectedProduct.name })}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              disabled={saving || !form.mp_sku.trim() || !form.product}
              onClick={() => void submitMapping()}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("catalog.mapping.saveMapping")}
            </button>
          </WmsCard>
        ) : null}

        <WmsCard>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              {t("catalog.mapping.emptyFilter")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <th className="px-3 py-2">{t("catalog.mapping.colMpSku")}</th>
                    <th className="px-3 py-2">{t("catalog.mapping.colMpName")}</th>
                    <th className="px-3 py-2">{t("catalog.mapping.colProduct")}</th>
                    <th className="px-3 py-2 text-center">{t("catalog.mapping.colActive")}</th>
                    {canEdit ? <th className="px-3 py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs text-indigo-700">{row.mp_sku}</td>
                      <td className="px-3 py-2 text-slate-600">{row.mp_product_name || "—"}</td>
                      <td className="px-3 py-2">
                        {row.expand?.product ? (
                          <>
                            <span className="font-mono text-xs text-indigo-700">
                              {row.expand.product.sku}
                            </span>{" "}
                            {row.expand.product.name}
                          </>
                        ) : (
                          row.product
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => void toggleActive(row)}
                            className={
                              "rounded-full px-2 py-0.5 text-xs font-bold " +
                              (row.is_active
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-600")
                            }
                          >
                            {row.is_active ? t("catalog.common.active") : t("catalog.common.inactive")}
                          </button>
                        ) : (
                          row.is_active ? t("catalog.common.active") : t("catalog.common.inactive")
                        )}
                      </td>
                      {canEdit ? (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void remove(row)}
                            className="rounded-md border border-red-200 p-1 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WmsCard>
      </CatalogShell>
    </InventoryShell>
  );
}
