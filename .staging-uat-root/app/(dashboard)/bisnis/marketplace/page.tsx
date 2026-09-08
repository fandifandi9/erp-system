"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus, Pencil, Trash2, X, Loader2, Layers, ChevronDown, ChevronRight, Calculator, Settings2, Percent,
} from "lucide-react";
import type { MpFeeTemplate, MpSellerTier, SalesChannel } from "@/lib/bisnis/types";
import { MarketplaceAvatar } from "@/components/bisnis/MarketplaceAvatar";
import { relationId } from "@/lib/bisnis/relation-id";
import { slugFromName } from "@/lib/bisnis/mp-slug";
import { tierBundleLabel } from "@/lib/bisnis/mp-template-client";
import {
  fetchSalesChannels,
  createSalesChannel,
  updateSalesChannel,
  deleteSalesChannel,
  fetchMpSellerTiers,
  createMpSellerTier,
  updateMpSellerTier,
  deleteMpSellerTier,
} from "@/lib/bisnis/client";
import {
  fetchMpFeeTemplates,
  createMpFeeTemplate,
  updateMpFeeTemplate,
  deleteMpFeeTemplate,
} from "@/lib/bisnis/mp-template-client";
import MpTemplateLineEditor from "@/app/(dashboard)/bisnis/penjualan-online/components/MpTemplateLineEditor";
import type { ProductRow } from "@/app/(dashboard)/bisnis/penjualan-online/components/ProductSkuFeeTable";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

const EMPTY_CHANNEL = { name: "", notes: "" };
const EMPTY_RUMUS = { name: "", seller_tier: "", notes: "" };
const EMPTY_TIER = { label: "" };

type Category = { id: string; name: string };

export default function MarketplaceMasterPage() {
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [templates, setTemplates] = useState<MpFeeTemplate[]>([]);
  const [tiers, setTiers] = useState<MpSellerTier[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [channelModal, setChannelModal] = useState(false);
  const [rumusModal, setRumusModal] = useState(false);
  const [tierModal, setTierModal] = useState(false);
  const [editorRumus, setEditorRumus] = useState<MpFeeTemplate | null>(null);

  const [editChannelId, setEditChannelId] = useState<string | null>(null);
  const [editRumusId, setEditRumusId] = useState<string | null>(null);
  const [editTierId, setEditTierId] = useState<string | null>(null);
  const [rumusChannelId, setRumusChannelId] = useState<string | null>(null);
  const [tierChannelId, setTierChannelId] = useState<string | null>(null);

  const [channelForm, setChannelForm] = useState(EMPTY_CHANNEL);
  const [rumusForm, setRumusForm] = useState(EMPTY_RUMUS);
  const [tierForm, setTierForm] = useState(EMPTY_TIER);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [ch, tpl, tr, pr, cat] = await Promise.all([
        fetchSalesChannels(false),
        fetchMpFeeTemplates({ sort: "sort_order,name" }),
        fetchMpSellerTiers(),
        pb.collection(INV_COLLECTIONS.products).getFullList<ProductRow>({
          filter: "is_active = true",
          sort: "name",
          expand: "category",
          fields: "id,sku,name,category,sell_price",
          requestKey: null,
        }),
        pb.collection(INV_COLLECTIONS.categories).getFullList<Category>({ sort: "name", requestKey: null }),
      ]);
      setChannels(ch);
      setTemplates(tpl);
      setTiers(tr);
      setProducts(pr);
      setCategories(cat);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat data marketplace");
      setChannels([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rumusFor = (channelId: string) =>
    templates
      .filter((t) => relationId(t.channel) === channelId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "id"));

  const tiersFor = (channelId: string) =>
    tiers
      .filter((t) => relationId(t.channel) === channelId && t.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label, "id"));

  const rumusLabel = (t: MpFeeTemplate, channelName: string) => {
    const tier = tiers.find((x) => x.id === relationId(t.seller_tier));
    return tier ? tierBundleLabel(channelName, tier.label) : t.name;
  };

  const openNewChannel = () => {
    setEditChannelId(null);
    setChannelForm(EMPTY_CHANNEL);
    setChannelModal(true);
  };

  const openEditChannel = (c: SalesChannel) => {
    setEditChannelId(c.id);
    setChannelForm({ name: c.name, notes: c.notes ?? "" });
    setChannelModal(true);
  };

  const openNewTier = (channelId: string) => {
    setTierChannelId(channelId);
    setEditTierId(null);
    setTierForm(EMPTY_TIER);
    setTierModal(true);
  };

  const openEditTier = (t: MpSellerTier) => {
    setTierChannelId(relationId(t.channel));
    setEditTierId(t.id);
    setTierForm({ label: t.label });
    setTierModal(true);
  };

  const openNewRumus = (channelId: string) => {
    setRumusChannelId(channelId);
    setEditRumusId(null);
    setRumusForm(EMPTY_RUMUS);
    setRumusModal(true);
  };

  const openEditRumus = (t: MpFeeTemplate) => {
    setRumusChannelId(relationId(t.channel));
    setEditRumusId(t.id);
    setRumusForm({
      name: t.name,
      seller_tier: relationId(t.seller_tier),
      notes: t.notes ?? "",
    });
    setRumusModal(true);
  };

  const openRumusEditor = (t: MpFeeTemplate) => setEditorRumus(t);

  const saveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const name = channelForm.name.trim();
      const payload = {
        name,
        code: slugFromName(name),
        notes: channelForm.notes.trim() || undefined,
        is_active: true,
      };
      if (editChannelId) await updateSalesChannel(editChannelId, payload);
      else await createSalesChannel(payload);
      setChannelModal(false);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan marketplace");
    } finally {
      setSubmitting(false);
    }
  };

  const saveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tierChannelId) return;
    setSubmitting(true);
    try {
      const label = tierForm.label.trim();
      const code = slugFromName(label);
      const sortOrder = tiersFor(tierChannelId).length + 1;
      const payload = {
        channel: tierChannelId,
        code,
        label,
        sort_order: sortOrder,
        is_active: true,
      };
      if (editTierId) await updateMpSellerTier(editTierId, payload);
      else await createMpSellerTier(payload);
      setTierModal(false);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan tier");
    } finally {
      setSubmitting(false);
    }
  };

  const saveRumus = async (e: React.FormEvent, openEditorAfter = false) => {
    e.preventDefault();
    if (!rumusChannelId) return;
    setSubmitting(true);
    try {
      const name = rumusForm.name.trim();
      const ch = channels.find((c) => c.id === rumusChannelId);
      const tier = tiers.find((t) => t.id === rumusForm.seller_tier);
      const autoName =
        tier && ch ? tierBundleLabel(ch.name, tier.label) : name;
      const payload: Partial<MpFeeTemplate> = {
        channel: rumusChannelId,
        name: autoName,
        code: slugFromName(autoName),
        notes: rumusForm.notes.trim() || undefined,
        seller_tier: rumusForm.seller_tier || undefined,
        is_active: true,
      };
      let saved: MpFeeTemplate;
      if (editRumusId) {
        saved = await updateMpFeeTemplate(editRumusId, { ...payload, name: name || autoName });
      } else {
        saved = await createMpFeeTemplate({ ...payload, name: name || autoName });
      }
      setRumusModal(false);
      await load();
      if (openEditorAfter) {
        const fresh = (await fetchMpFeeTemplates({ sort: "sort_order,name" })).find((t) => t.id === saved.id);
        if (fresh) setEditorRumus(fresh);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan rumus");
    } finally {
      setSubmitting(false);
    }
  };

  const removeChannel = async (id: string) => {
    if (!confirm("Hapus marketplace ini beserta tier dan rumusnya?")) return;
    try {
      const childTiers = tiersFor(id);
      const childRumus = rumusFor(id);
      await Promise.all(childRumus.map((t) => deleteMpFeeTemplate(t.id)));
      await Promise.all(childTiers.map((t) => deleteMpSellerTier(t.id)));
      await deleteSalesChannel(id);
      await load();
    } catch {
      alert("Gagal menghapus marketplace");
    }
  };

  const removeTier = async (id: string) => {
    if (!confirm("Hapus tier ini? Rumus yang terhubung tier ini tidak dihapus otomatis.")) return;
    try {
      await deleteMpSellerTier(id);
      await load();
    } catch {
      alert("Gagal menghapus tier");
    }
  };

  const removeRumus = async (id: string) => {
    if (!confirm("Hapus rumus potongan ini?")) return;
    try {
      await deleteMpFeeTemplate(id);
      if (editorRumus?.id === id) setEditorRumus(null);
      await load();
    } catch {
      alert("Gagal menghapus rumus");
    }
  };

  const seedDefaults = async () => {
    if (!confirm("Isi data contoh Shopee & Tokopedia? Data yang sudah ada tidak dihapus.")) return;
    setSeeding(true);
    try {
      const existing = await fetchSalesChannels(false);
      const ensure = async (code: string, name: string) => {
        const found = existing.find((c) => c.code === code);
        if (found) return found;
        return createSalesChannel({ code, name, is_active: true });
      };
      await ensure("shopee", "Shopee");
      await ensure("tokopedia", "Tokopedia");
      await ensure("lazada", "Lazada");
      await ensure("tiktok", "TikTok Shop");
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal mengisi data contoh");
    } finally {
      setSeeding(false);
    }
  };

  const editorChannel = editorRumus ? channels.find((c) => c.id === relationId(editorRumus.channel)) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Master Marketplace</h1>
            <p className="mt-1 text-sm text-slate-500">
              Satu tempat untuk marketplace, tier seller, dan rumus potongan. Rumus opsional — boleh
              tanpa potongan.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/bisnis/marketplace/fee-sku"
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100"
            >
              <Percent className="h-4 w-4" /> Fee per SKU
            </Link>
            <button
              type="button"
              onClick={() => void seedDefaults()}
              disabled={seeding}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              Isi data contoh
            </button>
            <button
              type="button"
              onClick={openNewChannel}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> Tambah marketplace
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-950">
          <p className="font-semibold">Cara buat rumus</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-indigo-900/90">
            <li>Tambah marketplace (Shopee, Tokopedia, …) — rumus belum wajib</li>
            <li>Opsional: tambah <strong>Tier seller</strong> (Regular, Mall, Star+, …)</li>
            <li>Tambah <strong>Rumus</strong> → klik <strong>Atur potongan</strong> untuk isi %, plafon, fee per SKU</li>
          </ol>
        </div>

        {loadError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Layers className="mx-auto h-12 w-12 text-slate-200" />
            <h3 className="mt-4 text-lg font-semibold text-slate-700">Belum ada marketplace</h3>
            <p className="mt-1 text-sm text-slate-500">
              Tambah platform seperti Shopee, Tokopedia. Rumus potongan tidak wajib saat pembuatan.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((c) => {
              const open = expandedId === c.id;
              const rumus = rumusFor(c.id);
              const channelTiers = tiersFor(c.id);
              return (
                <div key={c.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : c.id)}
                      className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                    >
                      {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </button>
                    <MarketplaceAvatar channel={c} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {channelTiers.length} tier · {rumus.length} rumus
                        {rumus.length === 0 && " · tanpa rumus (OK)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditChannel(c)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeChannel(c.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {open && (
                    <div className="space-y-4 border-t border-slate-100 bg-slate-50/80 px-4 py-4">
                      {/* Tier seller */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-700">Tier seller (opsional)</p>
                          <button
                            type="button"
                            onClick={() => openNewTier(c.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          >
                            <Plus className="h-3.5 w-3.5" /> Tambah tier
                          </button>
                        </div>
                        {channelTiers.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            Tanpa tier — rumus bisa dibuat sebagai rumus umum marketplace.
                          </p>
                        ) : (
                          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                            {channelTiers.map((t) => (
                              <li key={t.id} className="flex items-center justify-between px-4 py-2">
                                <span className="text-sm font-medium text-slate-800">{t.label}</span>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEditTier(t)}
                                    className="rounded p-1 text-slate-400 hover:text-indigo-600"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void removeTier(t.id)}
                                    className="rounded p-1 text-slate-400 hover:text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Rumus */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-700">Rumus potongan (opsional)</p>
                          <button
                            type="button"
                            onClick={() => openNewRumus(c.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          >
                            <Plus className="h-3.5 w-3.5" /> Tambah rumus
                          </button>
                        </div>
                        {rumus.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            Belum ada rumus untuk {c.name}. Marketplace tetap bisa dipakai tanpa rumus.
                          </p>
                        ) : (
                          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                            {rumus.map((t) => {
                              const tier = tiers.find((x) => x.id === relationId(t.seller_tier));
                              return (
                                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                  <div className="min-w-0">
                                    <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                                      <Calculator className="h-4 w-4 shrink-0 text-indigo-500" />
                                      {t.name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {tier ? `Tier: ${tier.label}` : "Tanpa tier · rumus umum"}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 gap-1">
                                    <button
                                      type="button"
                                      onClick={() => openRumusEditor(t)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                                    >
                                      <Settings2 className="h-3.5 w-3.5" /> Atur potongan
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openEditRumus(t)}
                                      className="rounded p-1 text-slate-400 hover:text-indigo-600"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void removeRumus(t.id)}
                                      className="rounded p-1 text-slate-400 hover:text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: marketplace */}
      {channelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">
                {editChannelId ? "Edit marketplace" : "Tambah marketplace"}
              </h2>
              <button type="button" onClick={() => setChannelModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void saveChannel(e)} className="space-y-4 px-6 py-5">
              <div className="flex items-center gap-4">
                <MarketplaceAvatar
                  channel={{ name: channelForm.name || "Marketplace", code: slugFromName(channelForm.name) }}
                  size="lg"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Nama marketplace *</label>
                <input
                  required
                  value={channelForm.name}
                  onChange={(e) => setChannelForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Shopee"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Rumus potongan <strong>tidak wajib</strong>. Tambahkan tier & rumus setelah marketplace dibuat.
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium">Catatan</label>
                <input
                  value={channelForm.notes}
                  onChange={(e) => setChannelForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Menyimpan…" : "Simpan"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: tier */}
      {tierModal && tierChannelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">{editTierId ? "Edit tier" : "Tambah tier"}</h2>
              <button type="button" onClick={() => setTierModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void saveTier(e)} className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Nama tier *</label>
                <input
                  required
                  value={tierForm.label}
                  onChange={(e) => setTierForm({ label: e.target.value })}
                  placeholder="Regular / Mall / Star+"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Menyimpan…" : "Simpan"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: rumus metadata */}
      {rumusModal && rumusChannelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">{editRumusId ? "Edit rumus" : "Tambah rumus"}</h2>
              <button type="button" onClick={() => setRumusModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => void saveRumus(e, !editRumusId)}
              className="space-y-4 px-6 py-5"
            >
              <div>
                <label className="mb-1 block text-sm font-medium">Nama rumus *</label>
                <input
                  required
                  value={rumusForm.name}
                  onChange={(e) => setRumusForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Potongan Regular Shopee"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Tier seller (opsional)</label>
                <select
                  value={rumusForm.seller_tier}
                  onChange={(e) => setRumusForm((f) => ({ ...f, seller_tier: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Tanpa tier — rumus umum</option>
                  {tiersFor(rumusChannelId).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Catatan</label>
                <input
                  value={rumusForm.notes}
                  onChange={(e) => setRumusForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Menyimpan…" : editRumusId ? "Simpan" : "Simpan & atur potongan"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: editor potongan lengkap */}
      {editorRumus && editorChannel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Atur potongan — {editorRumus.name}</h2>
                <p className="text-xs text-slate-500">{editorChannel.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditorRumus(null)}
                className="rounded-lg p-1.5 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">
              <MpTemplateLineEditor
                templateId={editorRumus.id}
                label={rumusLabel(editorRumus, editorChannel.name)}
                categories={categories}
                products={products}
                sellerTierId={relationId(editorRumus.seller_tier)}
                onChanged={() => void load()}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
