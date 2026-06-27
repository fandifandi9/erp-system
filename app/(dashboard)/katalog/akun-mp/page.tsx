"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Pencil, Trash2, X, Store } from "lucide-react";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { CatalogShell } from "@/components/catalog/CatalogShell";
import { WmsCard } from "@/components/wms/ui";
import { canEditCatalogPrices } from "@/lib/catalog/catalog-access";
import {
  fetchAllCustomers,
  fetchMpFeeTemplates,
  fetchMpSellerTiers,
  fetchSalesChannels,
  fetchStores,
  fetchStoreChannelAccounts,
  createStoreChannelAccount,
  updateStoreChannelAccount,
  deleteStoreChannelAccount,
} from "@/lib/bisnis/client";
import type { Customer, MpFeeTemplate, MpSellerTier, SalesChannel, StoreChannelAccount, Store as BizStore } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import { pb } from "@/lib/pocketbase";
import { useLocale } from "@/components/LocaleProvider";

const EMPTY_FORM = {
  store: "",
  channel: "",
  seller_tier: "",
  account_name: "",
  mp_shop_id: "",
  default_customer: "",
  default_fee_template: "",
  notes: "",
  is_active: true,
};

export default function KatalogAkunMpPage() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const user = pb.authStore.model;
  const canEdit = user ? canEditCatalogPrices(user) : false;

  const [stores, setStores] = useState<BizStore[]>([]);
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [tiers, setTiers] = useState<MpSellerTier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [templates, setTemplates] = useState<MpFeeTemplate[]>([]);
  const [accounts, setAccounts] = useState<StoreChannelAccount[]>([]);
  const [filterStore, setFilterStore] = useState(searchParams.get("store") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      const [st, ch, tr, cu, tpl] = await Promise.all([
        fetchStores(false),
        fetchSalesChannels(false),
        fetchMpSellerTiers(),
        fetchAllCustomers(),
        fetchMpFeeTemplates({ sort: "name" }).catch(() => [] as MpFeeTemplate[]),
      ]);
      setStores(st);
      setChannels(ch.filter((c) => c.is_active !== false));
      setTiers(tr);
      setCustomers(cu);
      setTemplates(tpl);
      setFilterStore((prev) => prev || searchParams.get("store") || st[0]?.id || "");
    })();
  }, [searchParams]);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const all = await fetchStoreChannelAccounts(false);
      setAccounts(filterStore ? all.filter((a) => a.store === filterStore) : all);
    } catch (e) {
      setError(getErrorMessage(e));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [filterStore]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const tiersForChannel = tiers.filter((t) => !form.channel || t.channel === form.channel);

  const openNew = () => {
    setEditId(null);
    setForm({
      ...EMPTY_FORM,
      store: filterStore || stores[0]?.id || "",
      default_customer: customers[0]?.id || "",
    });
    setModal(true);
  };

  const openEdit = (row: StoreChannelAccount) => {
    setEditId(row.id);
    setForm({
      store: row.store,
      channel: row.channel,
      seller_tier: row.seller_tier,
      account_name: row.account_name,
      mp_shop_id: row.mp_shop_id ?? "",
      default_customer: row.default_customer ?? "",
      default_fee_template: row.default_fee_template ?? "",
      notes: row.notes ?? "",
      is_active: row.is_active !== false,
    });
    setModal(true);
  };

  const submit = async () => {
    if (!form.store || !form.channel || !form.seller_tier || !form.account_name.trim()) {
      setError(t("catalog.akunMp.errRequired"));
      return;
    }
    if (!form.default_customer) {
      setError(t("catalog.akunMp.errDefaultCustomer"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        store: form.store,
        channel: form.channel,
        seller_tier: form.seller_tier,
        account_name: form.account_name.trim(),
        mp_shop_id: form.mp_shop_id.trim() || undefined,
        default_customer: form.default_customer,
        default_fee_template: form.default_fee_template || undefined,
        notes: form.notes.trim() || undefined,
        is_active: form.is_active,
      };
      if (editId) {
        await updateStoreChannelAccount(editId, payload);
      } else {
        await createStoreChannelAccount(payload);
      }
      setModal(false);
      await loadAccounts();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (row: StoreChannelAccount) => {
    if (!window.confirm(t("catalog.akunMp.confirmDelete", { name: row.account_name }))) return;
    try {
      await deleteStoreChannelAccount(row.id);
      await loadAccounts();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const storeName = (id: string) =>
    stores.find((s) => s.id === id)?.name ??
    accounts.find((a) => a.store === id)?.expand?.store?.name ??
    id;

  const channelName = (id: string) =>
    channels.find((c) => c.id === id)?.name ??
    accounts.find((a) => a.channel === id)?.expand?.channel?.name ??
    id;

  return (
    <InventoryShell title="" subtitle="" module="wms">
      <CatalogShell
        title={t("catalog.akunMp.title")}
        subtitle={t("catalog.akunMp.subtitle")}
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              {t("catalog.akunMp.addAccount")}
            </button>
          ) : null
        }
      >
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <WmsCard>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px]">
              <label className="mb-0.5 block text-xs font-medium text-slate-600">{t("catalog.akunMp.filterStore")}</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={filterStore}
                onChange={(e) => setFilterStore(e.target.value)}
              >
                <option value="">{t("catalog.akunMp.allStores")}</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500">
              {t("catalog.akunMp.needContact")}{" "}
              <Link href="/bisnis/kontak" className="font-medium text-indigo-600 hover:underline">
                {t("catalog.akunMp.manageContact")}
              </Link>
              {" · "}
              <Link href="/katalog/mapping" className="font-medium text-indigo-600 hover:underline">
                {t("catalog.akunMp.mappingLink")}
              </Link>
            </p>
          </div>
        </WmsCard>

        <WmsCard>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              <Store className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              {filterStore ? t("catalog.akunMp.emptyForStore") : t("catalog.akunMp.empty")}
              {canEdit ? (
                <p className="mt-2">
                  <button type="button" onClick={openNew} className="font-semibold text-indigo-600 hover:underline">
                    {t("catalog.akunMp.addFirst")}
                  </button>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <th className="px-3 py-2">{t("catalog.akunMp.colAccountName")}</th>
                    <th className="px-3 py-2">{t("catalog.akunMp.colStore")}</th>
                    <th className="px-3 py-2">{t("catalog.akunMp.colChannel")}</th>
                    <th className="px-3 py-2">{t("catalog.akunMp.colTier")}</th>
                    <th className="px-3 py-2 text-center">{t("catalog.akunMp.colActive")}</th>
                    {canEdit ? <th className="px-3 py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium">{row.account_name}</td>
                      <td className="px-3 py-2">{storeName(row.store)}</td>
                      <td className="px-3 py-2">{channelName(row.channel)}</td>
                      <td className="px-3 py-2">
                        {row.expand?.seller_tier?.label ?? row.seller_tier}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-xs font-bold " +
                            (row.is_active !== false
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600")
                          }
                        >
                          {row.is_active !== false ? t("catalog.common.active") : t("catalog.common.inactive")}
                        </span>
                      </td>
                      {canEdit ? (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="mr-1 rounded border border-slate-200 p-1 hover:bg-slate-50"
                          >
                            <Pencil className="h-4 w-4 text-slate-600" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(row)}
                            className="rounded border border-red-200 p-1 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
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

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">
                  {editId ? t("catalog.akunMp.modalEdit") : t("catalog.akunMp.modalNew")}
                </h2>
                <button type="button" onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <Field label={`${t("catalog.akunMp.colStore")} *`}>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.store}
                    onChange={(e) => setForm((f) => ({ ...f, store: e.target.value }))}
                  >
                    <option value="">{t("catalog.akunMp.selectStore")}</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`${t("catalog.akunMp.channelMp")} *`}>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.channel}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, channel: e.target.value, seller_tier: "" }))
                    }
                  >
                    <option value="">{t("catalog.akunMp.selectChannel")}</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`${t("catalog.akunMp.sellerTier")} *`}>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.seller_tier}
                    onChange={(e) => setForm((f) => ({ ...f, seller_tier: e.target.value }))}
                    disabled={!form.channel}
                  >
                    <option value="">{t("catalog.akunMp.selectTier")}</option>
                    {tiersForChannel.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                        {tier.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`${t("catalog.akunMp.accountName")} *`}>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder={t("catalog.akunMp.accountNamePlaceholder")}
                    value={form.account_name}
                    onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
                  />
                </Field>
                <Field label={t("catalog.akunMp.shopId")}>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.mp_shop_id}
                    onChange={(e) => setForm((f) => ({ ...f, mp_shop_id: e.target.value }))}
                  />
                </Field>
                <Field label={`${t("catalog.akunMp.defaultCustomer")} *`}>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.default_customer}
                    onChange={(e) => setForm((f) => ({ ...f, default_customer: e.target.value }))}
                  >
                    <option value="">{t("catalog.akunMp.selectContact")}</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("catalog.akunMp.feeTemplate")}>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.default_fee_template}
                    onChange={(e) => setForm((f) => ({ ...f, default_fee_template: e.target.value }))}
                  >
                    <option value="">{t("catalog.akunMp.noTemplate")}</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("catalog.akunMp.notes")}>
                  <textarea
                    className="min-h-[60px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </Field>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  />
                  <span>{t("catalog.akunMp.active")}</span>
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submit()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? t("catalog.akunMp.saving") : t("catalog.common.save")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </CatalogShell>
    </InventoryShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-0.5 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
