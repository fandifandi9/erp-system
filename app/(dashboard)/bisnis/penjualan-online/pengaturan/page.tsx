"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Loader2, Layers, Store, Calculator, Package, CheckCircle2,
} from "lucide-react";
import {
  fetchSalesChannels, createSalesChannel, updateSalesChannel, deleteSalesChannel,
  fetchMpSellerTiers, createMpSellerTier, updateMpSellerTier, deleteMpSellerTier,
  fetchStoreChannelAccounts, createStoreChannelAccount, updateStoreChannelAccount, deleteStoreChannelAccount,
  fetchMpFeeTemplates,
  fetchStores, fetchAllCustomers,
} from "@/lib/bisnis/client";
import MpFeeBundleEditor from "../components/MpFeeBundleEditor";
import { tierBundleLabel } from "@/lib/bisnis/mp-template-client";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { MpFeeTemplate, MpSellerTier, SalesChannel, StoreChannelAccount } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import { slugFromName, storePlatformLabel } from "@/lib/bisnis/mp-slug";

type Tab = "channels" | "tiers" | "fees" | "accounts";
type Product = {
  id: string;
  sku: string;
  name: string;
  sell_price?: number;
  category?: string;
  expand?: { category?: { id: string; name: string } };
};
type Category = { id: string; name: string };

const INPUT_CLS =
  "w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export default function PengaturanPenjualanOnlinePage() {
  const [tab, setTab] = useState<Tab>("channels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [tiers, setTiers] = useState<MpSellerTier[]>([]);
  const [accounts, setAccounts] = useState<StoreChannelAccount[]>([]);
  const [feeTemplates, setFeeTemplates] = useState<MpFeeTemplate[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [modal, setModal] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [chForm, setChForm] = useState({ name: "", notes: "" });
  const [tierForm, setTierForm] = useState({ channel: "", tier_name: "" });
  const [accForm, setAccForm] = useState({ store: "", fee_template: "" });
  const [seeding, setSeeding] = useState(false);

  const tiersForChannel = (channelId: string) =>
    tiers.filter((t) => t.channel === channelId && t.id);

  const accountsFiltered = accounts.filter((a) => a.id);

  function templateLabel(t: MpFeeTemplate): string {
    const platform = t.expand?.channel?.name ?? channels.find((c) => c.id === t.channel)?.name ?? "?";
    const tier = t.expand?.seller_tier?.label ?? tiers.find((x) => x.id === t.seller_tier)?.label ?? "?";
    return t.name || tierBundleLabel(platform, tier);
  }

  function accountPaketLabel(a: StoreChannelAccount): string {
    if (a.default_fee_template) {
      const tpl = feeTemplates.find((t) => t.id === a.default_fee_template);
      if (tpl) return templateLabel(tpl);
    }
    const platform = a.expand?.channel?.name ?? "?";
    const tier = a.expand?.seller_tier?.label ?? "?";
    return tierBundleLabel(platform, tier);
  }

  const refreshFeeTemplates = useCallback(async () => {
    try {
      setFeeTemplates(await fetchMpFeeTemplates({ filter: "is_active = true" }));
    } catch {
      /* ignore — banner error already shown on full load */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const problems: string[] = [];

    try {
      setChannels(await fetchSalesChannels(false));
    } catch (e: unknown) {
      setChannels([]);
      problems.push(`• biz_sales_channels: ${getErrorMessage(e)}`);
    }

    try {
      setTiers(await fetchMpSellerTiers());
    } catch (e: unknown) {
      setTiers([]);
      problems.push(`• biz_mp_seller_tiers: ${getErrorMessage(e)}`);
    }

    try {
      setAccounts(await fetchStoreChannelAccounts(false));
    } catch (e: unknown) {
      setAccounts([]);
      problems.push(`• biz_store_channel_accounts: ${getErrorMessage(e)}`);
    }

    try {
      setFeeTemplates(await fetchMpFeeTemplates({ filter: "is_active = true" }));
    } catch (e: unknown) {
      problems.push(`• biz_mp_fee_templates: ${getErrorMessage(e)}`);
    }

    try {
      const st = await fetchStores(false);
      setStores(st.map((s) => ({ id: s.id, name: s.name })));
    } catch (e: unknown) {
      problems.push(`• biz_stores: ${getErrorMessage(e)}`);
    }

    try {
      const cu = await fetchAllCustomers();
      setCustomers(cu.map((c) => ({ id: c.id, name: c.name })));
    } catch (e: unknown) {
      problems.push(`• biz_customers: ${getErrorMessage(e)}`);
    }

    try {
      const pr = await pb.collection(INV_COLLECTIONS.products).getFullList<Product>({
        filter: "is_active = true",
        sort: "name",
        expand: "category",
        fields: "id,sku,name,category,sell_price",
        requestKey: null,
      });
      setProducts(pr);
    } catch (e: unknown) {
      problems.push(`• inv_products: ${getErrorMessage(e)}`);
    }

    try {
      setCategories(await pb.collection(INV_COLLECTIONS.categories).getFullList<Category>({
        sort: "name",
        requestKey: null,
      }));
    } catch (e: unknown) {
      problems.push(`• inv_categories: ${getErrorMessage(e)}`);
    }

    if (problems.length > 0) {
      setError(
        problems.join("\n") +
          "\n\nCek di PocketBase: (1) collection sudah dibuat, (2) API Rules = @request.auth.id != \"\", (3) nama field relation persis: channel, seller_tier, store, default_customer.",
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs: { id: Tab; label: string; icon: typeof Store }[] = [
    { id: "channels", label: "① Platform", icon: Layers },
    { id: "tiers", label: "② Tier", icon: Layers },
    { id: "fees", label: "③ Biaya", icon: Calculator },
    { id: "accounts", label: "④ Mapping Toko", icon: Store },
  ];

  const feeTemplateOptions = feeTemplates.filter((t) => t.channel && t.seller_tier);

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const name = chForm.name.trim();
      if (editId) {
        await updateSalesChannel(editId, { name, notes: chForm.notes || undefined, is_active: true });
      } else {
        await createSalesChannel({ name, code: slugFromName(name), notes: chForm.notes || undefined, is_active: true });
      }
      setModal(null); load();
    } catch (e: unknown) { alert(getErrorMessage(e)); }
    finally { setSubmitting(false); }
  };

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const label = tierForm.tier_name.trim();
      const code = slugFromName(label);
      const sortOrder = tiers.filter((t) => t.channel === tierForm.channel).length + 1;
      const payload = {
        channel: tierForm.channel,
        code,
        label,
        sort_order: sortOrder,
        is_active: true,
      };
      if (editId) await updateMpSellerTier(editId, payload);
      else await createMpSellerTier(payload);
      setModal(null); load();
    } catch (e: unknown) { alert(getErrorMessage(e)); }
    finally { setSubmitting(false); }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const tpl = feeTemplates.find((t) => t.id === accForm.fee_template);
      if (!tpl?.channel || !tpl.seller_tier) {
        alert("Pilih paket biaya (Platform + Tier) dari tab ③ Biaya.");
        return;
      }

      const storeName = stores.find((s) => s.id === accForm.store)?.name ?? "Toko";
      const platformName = tpl.expand?.channel?.name ?? channels.find((c) => c.id === tpl.channel)?.name ?? "MP";
      const tierName = tpl.expand?.seller_tier?.label ?? tiers.find((t) => t.id === tpl.seller_tier)?.label ?? "";
      const account_name = storePlatformLabel(storeName, platformName, tierName);

      const duplicate = accountsFiltered.find(
        (a) =>
          a.id !== editId &&
          a.store === accForm.store &&
          a.default_fee_template === accForm.fee_template,
      );
      if (duplicate) {
        alert("Mapping toko + paket biaya ini sudah ada.");
        return;
      }

      const default_customer =
        (editId ? accounts.find((a) => a.id === editId)?.default_customer : undefined) ??
        customers[0]?.id;
      if (!default_customer) {
        alert("Buat minimal 1 kontak di menu Kontak agar posting invoice bisa jalan.");
        return;
      }

      const payload = {
        store: accForm.store,
        channel: tpl.channel,
        seller_tier: tpl.seller_tier,
        default_fee_template: tpl.id,
        default_customer,
        account_name,
        is_active: true,
      };
      if (editId) await updateStoreChannelAccount(editId, payload);
      else await createStoreChannelAccount(payload);
      setModal(null); load();
    } catch (e: unknown) { alert(getErrorMessage(e)); }
    finally { setSubmitting(false); }
  };

  const seedBasics = async () => {
    setSeeding(true);
    try {
      const allCh = await fetchSalesChannels(false);
      let chTokopedia = allCh.find((c) => c.code === "tokopedia");
      if (!chTokopedia) {
        chTokopedia = await createSalesChannel({ code: "tokopedia", name: "Tokopedia", is_active: true });
      }
      if (!allCh.find((c) => c.code === "shopee")) {
        await createSalesChannel({ code: "shopee", name: "Shopee", is_active: true });
      }
      const existingTiers = await fetchMpSellerTiers();
      if (!existingTiers.some((t) => t.channel === chTokopedia!.id && t.code === "regular")) {
        await createMpSellerTier({
          channel: chTokopedia.id,
          code: "regular",
          label: "Regular",
          sort_order: 1,
          is_active: true,
        });
      }
      if (!existingTiers.some((t) => t.channel === chTokopedia!.id && t.code === "premium")) {
        await createMpSellerTier({
          channel: chTokopedia.id,
          code: "premium",
          label: "Premium",
          sort_order: 2,
          is_active: true,
        });
      }
      await load();
      setTab("channels");
      alert("Data awal Tokopedia + tier Mall & Premium dibuat. Lanjut tab Mapping Toko.");
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal membuat data awal"));
    } finally {
      setSeeding(false);
    }
  };

  const openTierModal = () => {
    if (channels.length === 0) {
      alert("Buat Platform dulu (tab ①).");
      setTab("channels");
      return;
    }
    setEditId(null);
    setTierForm({ channel: channels[0].id, tier_name: "" });
    setModal("tier");
  };

  const openAccountModal = () => {
    if (stores.length === 0) {
      alert("Butuh minimal 1 Toko.");
      return;
    }
    if (feeTemplateOptions.length === 0) {
      alert("Buat biaya dulu di tab ③ (pilih Platform + Tier, tambah biaya).");
      setTab("fees");
      return;
    }
    setEditId(null);
    setAccForm({
      store: stores[0].id,
      fee_template: feeTemplateOptions[0].id,
    });
    setModal("account");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link href="/bisnis/penjualan-online" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Penjualan Online
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Pengaturan Penjualan Online</h1>
        <p className="mt-1 text-sm text-slate-500">
          Urutan: Platform → Tier → Biaya → Mapping toko. SKU master SERBA dipakai otomatis saat import.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-indigo-900/90">
          Tab <strong>③ Biaya</strong>: koleksi per Platform + Tier — biaya umum + fee % per SKU.
          Tab <strong>④ Mapping Toko</strong>: hubungkan toko dengan koleksi biaya. Selesai di sini.
        </p>

        {error && (
          <div className="mt-4 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
          <p className="font-semibold">Urutan setup:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li><strong>Platform</strong> — {channels.length} (Shopee, Tokopedia, …)</li>
            <li><strong>Tier</strong> — {tiers.length} (Mall, Premium, Regular, …)</li>
            <li><strong>Biaya</strong> — {feeTemplateOptions.length} paket (platform + tier + jenis biaya)</li>
            <li><strong>Mapping toko</strong> — {accountsFiltered.length} (toko + paket biaya dari langkah ③)</li>
          </ol>
          <div className="mt-3 rounded-lg border border-violet-200 bg-white/80 p-3 text-xs text-slate-700">
            <p className="font-semibold text-violet-900">Biaya per SKU — singkatnya:</p>
            <p className="mt-1">
              Di tab ③, pilih koleksi (platform + tier), lalu set <strong>fee % per SKU</strong> di tabel produk.
              SKU dikunci dari master SERBA — saat import, SKU menentukan komisi. Tier berbeda (Mall vs Regular)
              = koleksi berbeda, rate bisa beda per tier.
            </p>
          </div>
          {channels.length === 0 && (
            <button
              type="button"
              disabled={seeding}
              onClick={seedBasics}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {seeding ? "Membuat…" : "Buat data awal (Tokopedia + tier Regular & Premium)"}
            </button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition ${tab === t.id ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
        ) : (
          <div className="mt-6">
            {tab === "channels" && (
              <Section
                title="Platform Marketplace"
                onAdd={() => { setEditId(null); setChForm({ name: "", notes: "" }); setModal("channel"); }}
              >
                {channels.length === 0 && (
                  <p className="mb-3 text-sm text-amber-700">Belum ada platform. Contoh: Shopee, Tokopedia, Blibli.</p>
                )}
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Nama platform</th><th></th></tr></thead>
                  <tbody>
                    {channels.map((c) => (
                      <tr key={c.id} className="border-b border-slate-50">
                        <td className="py-2 font-medium">{c.name}</td>
                        <td className="text-right">
                          <button type="button" onClick={() => { setEditId(c.id); setChForm({ name: c.name, notes: c.notes ?? "" }); setModal("channel"); }} className="p-1 text-slate-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button>
                          <button type="button" onClick={async () => { if (confirm("Hapus?")) { await deleteSalesChannel(c.id); load(); } }} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {tab === "tiers" && (
              <Section title="Tier per Platform" onAdd={openTierModal}>
                {channels.length === 0 && (
                  <p className="mb-3 text-sm text-amber-700">Buat Platform di tab ① dulu.</p>
                )}
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Platform</th><th>Nama tier</th><th></th></tr></thead>
                  <tbody>
                    {tiers.map((t) => (
                      <tr key={t.id} className="border-b border-slate-50">
                        <td className="py-2">{channels.find((c) => c.id === t.channel)?.name ?? "—"}</td>
                        <td className="font-medium">{t.label}</td>
                        <td className="text-right">
                          <button type="button" onClick={() => { setEditId(t.id); setTierForm({ channel: t.channel, tier_name: t.label }); setModal("tier"); }} className="p-1 text-slate-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button>
                          <button type="button" onClick={async () => { if (confirm("Hapus?")) { await deleteMpSellerTier(t.id); load(); } }} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {tab === "fees" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <h2 className="mb-1 font-semibold text-slate-900">③ Biaya — Platform + Tier</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Pilih Platform + Tier, atur biaya umum di atas, lalu set <strong>fee % per SKU</strong> di tabel produk.
                  Rate beda per tier — buat koleksi terpisah per platform+tier.
                </p>
                <MpFeeBundleEditor
                  channels={channels}
                  tiers={tiers}
                  categories={categories}
                  products={products}
                  feeTemplates={feeTemplates}
                  onChanged={refreshFeeTemplates}
                />
              </div>
            )}

            {tab === "accounts" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">④ Mapping Toko × Koleksi Biaya</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Satu kartu = satu toko terhubung ke koleksi biaya (platform + tier). Dipakai saat import penjualan online.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openAccountModal}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    <Plus className="h-4 w-4" /> Tambah
                  </button>
                </div>

                {stores.length === 0 && (
                  <p className="mb-3 text-sm text-amber-700">Butuh minimal 1 toko di sistem.</p>
                )}
                {feeTemplateOptions.length === 0 && (
                  <p className="mb-3 text-sm text-amber-700">
                    Belum ada koleksi biaya — buat dulu di tab ③.
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {accountsFiltered.map((a) => {
                    const storeName = a.expand?.store?.name ?? stores.find((s) => s.id === a.store)?.name ?? "Toko";
                    const paket = accountPaketLabel(a);
                    return (
                      <div
                        key={a.id}
                        className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200"
                      >
                        <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                          <Store className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{storeName}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-indigo-700">
                            <Package className="h-3 w-3 shrink-0" />
                            {paket}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> Terhubung
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-0.5">
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => {
                              setEditId(a.id);
                              setAccForm({ store: a.store, fee_template: a.default_fee_template ?? "" });
                              setModal("account");
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Hapus"
                            onClick={async () => {
                              if (confirm(`Hapus mapping ${storeName}?`)) {
                                await deleteStoreChannelAccount(a.id);
                                load();
                              }
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {accountsFiltered.length === 0 && stores.length > 0 && feeTemplateOptions.length > 0 && (
                    <button
                      type="button"
                      onClick={openAccountModal}
                      className="flex min-h-[100px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-4 text-slate-400 transition hover:border-indigo-300 hover:text-indigo-600"
                    >
                      <Plus className="h-6 w-6" />
                      <span className="text-xs font-medium">Tambah mapping toko</span>
                    </button>
                  )}
                </div>

                {feeTemplateOptions.length > 0 && (
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <p className="mb-2 text-xs font-medium text-slate-600">Koleksi biaya tersedia (tab ③)</p>
                    <div className="flex flex-wrap gap-2">
                      {feeTemplateOptions.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-800"
                        >
                          <Package className="h-3 w-3" />
                          {templateLabel(t)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {modal === "channel" && (
          <Modal title={editId ? "Edit Platform" : "Tambah Platform"} onClose={() => setModal(null)}>
            <form onSubmit={handleSaveChannel} className="space-y-3">
              <Field label="Nama platform"><input required value={chForm.name} onChange={(e) => setChForm({ ...chForm, name: e.target.value })} className={INPUT_CLS} placeholder="Shopee" /></Field>
              <Field label="Catatan (opsional)"><textarea value={chForm.notes} onChange={(e) => setChForm({ ...chForm, notes: e.target.value })} className={INPUT_CLS} rows={2} /></Field>
              <Submit submitting={submitting} />
            </form>
          </Modal>
        )}

        {modal === "tier" && (
          <Modal title={editId ? "Edit Tier" : "Tambah Tier"} onClose={() => setModal(null)}>
            <form onSubmit={handleSaveTier} className="space-y-3">
              <FormSelect
                label="Platform"
                required
                value={tierForm.channel}
                onChange={(v) => setTierForm({ ...tierForm, channel: v })}
                options={channels.map((c) => ({ value: c.id, label: c.name }))}
                emptyHint="Belum ada platform — tab ①"
              />
              <Field label="Nama tier"><input required value={tierForm.tier_name} onChange={(e) => setTierForm({ ...tierForm, tier_name: e.target.value })} className={INPUT_CLS} placeholder="Mall / Premium / Regular" /></Field>
              <Submit submitting={submitting} disabled={!tierForm.channel} />
            </form>
          </Modal>
        )}

        {modal === "account" && (
          <Modal title={editId ? "Edit Mapping Toko" : "Mapping Toko"} onClose={() => setModal(null)}>
            <form onSubmit={handleSaveAccount} className="space-y-3">
              <FormSelect
                label="Toko"
                required
                value={accForm.store}
                onChange={(v) => setAccForm({ ...accForm, store: v })}
                options={stores.map((s) => ({ value: s.id, label: s.name }))}
                emptyHint="Belum ada toko di biz_stores"
              />
              <FormSelect
                label="Koleksi biaya (Platform + Tier)"
                required
                value={accForm.fee_template}
                onChange={(v) => setAccForm({ ...accForm, fee_template: v })}
                options={feeTemplateOptions.map((t) => ({
                  value: t.id,
                  label: templateLabel(t),
                }))}
                emptyHint="Buat koleksi biaya dulu di tab ③"
              />
              <p className="text-xs text-slate-500">
                Koleksi menentukan gratis ongkir, cashback, fee per SKU, dll. saat import.
                Pembeli asli dari Excel tetap tercatat di nota.
              </p>
              <Submit
                submitting={submitting}
                disabled={!accForm.store || !accForm.fee_template}
              />
            </form>
          </Modal>
        )}
      </div>
    </div>
  );
}

function Section({ title, onAdd, children }: { title: string; onAdd: () => void; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" /> Tambah
        </button>
      </div>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span>{children}</label>;
}

function FormSelect({
  label,
  value,
  onChange,
  options,
  required,
  allowEmpty,
  emptyLabel = "— Pilih —",
  emptyHint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  emptyHint?: string;
}) {
  const validOptions = options.filter((o) => o.value);
  const showPlaceholder = allowEmpty || !required;

  return (
    <Field label={label}>
      <select
        required={required && validOptions.length > 0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLS}
      >
        {showPlaceholder && (
          <option value="">
            {validOptions.length === 0 ? `— ${emptyHint ?? "Tidak ada data"} —` : emptyLabel}
          </option>
        )}
        {validOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {validOptions.length === 0 && emptyHint && (
        <p className="mt-1 text-xs text-amber-600">{emptyHint}</p>
      )}
    </Field>
  );
}

function Submit({ submitting, disabled }: { submitting: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={submitting || disabled}
      className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {submitting ? "Menyimpan…" : "Simpan"}
    </button>
  );
}
