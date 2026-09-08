"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Loader2, Plus, Save } from "lucide-react";
import {
  fetchCompanyProfiles,
  saveCompanyProfile,
  countActiveCompanyProfiles,
} from "@/lib/bisnis/company-client";
import {
  defaultProvisionFromProfile,
  EMPTY_ENTITY_PROVISION,
  entityHasOperationalStack,
  provisionEntityDefaults,
  provisionFormIsValid,
  type EntityProvisionForm,
} from "@/lib/bisnis/entity-provision";
import { EntitySetupFormSection } from "@/components/bisnis/EntitySetupFormSection";
import { EntityLogoSection } from "@/components/bisnis/EntityLogoSection";
import type { CompanyProfile, NpwpDisplayMode } from "@/lib/bisnis/types";
import { writeAuditLog } from "@/lib/tenant/audit-log";
import { useLocale } from "@/components/LocaleProvider";

const EMPTY = {
  code: "",
  company_name: "",
  legal_name: "",
  npwp: "",
  address: "",
  city: "",
  phone: "",
  email: "",
  website: "",
  show_npwp_on_documents: false,
  npwp_display_mode: "footer" as NpwpDisplayMode,
  is_active: true,
};

export default function PerusahaanPage() {
  const { t } = useLocale();
  const [entities, setEntities] = useState<CompanyProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [prevNpwp, setPrevNpwp] = useState<{ show: boolean; mode: NpwpDisplayMode } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [stackComplete, setStackComplete] = useState<boolean | null>(null);
  const [provision, setProvision] = useState<EntityProvisionForm>(EMPTY_ENTITY_PROVISION);
  const [showInactive, setShowInactive] = useState(true);
  const isNew = selectedId === "__new__";

  const visibleEntities = showInactive
    ? entities
    : entities.filter((e) => e.is_active !== false);

  function applyProfile(p: CompanyProfile) {
    const show = p.show_npwp_on_documents === true;
    const mode = (p.npwp_display_mode as NpwpDisplayMode) || "footer";
    setForm({
      code: p.code ?? "",
      company_name: p.company_name ?? "",
      legal_name: p.legal_name ?? "",
      npwp: p.npwp ?? "",
      address: p.address ?? "",
      city: p.city ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      website: p.website ?? "",
      show_npwp_on_documents: show,
      npwp_display_mode: mode,
      is_active: p.is_active !== false,
    });
    setPrevNpwp({ show, mode });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setSchemaMissing(false);
    try {
      const list = await fetchCompanyProfiles(false);
      setEntities(list);
      if (selectedId && selectedId !== "__new__") {
        const found = list.find((e) => e.id === selectedId);
        if (found) applyProfile(found);
      } else if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
        applyProfile(list[0]);
      }
    } catch {
      setSchemaMissing(true);
    }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectEntity = (id: string) => {
    setSelectedId(id);
    setSaved(false);
    setProvisionMsg(null);
    setStackComplete(null);
    if (id === "__new__") {
      setForm(EMPTY);
      setPrevNpwp(null);
      setProvision(EMPTY_ENTITY_PROVISION);
      return;
    }
    const e = entities.find((x) => x.id === id);
    if (e) {
      applyProfile(e);
      setProvision(defaultProvisionFromProfile(e));
      void entityHasOperationalStack(e.id).then(setStackComplete);
    }
  };

  const runProvision = async (companyId: string, companyName: string, companyCode?: string) => {
    setProvisioning(true);
    setProvisionMsg(null);
    try {
      const result = await provisionEntityDefaults({
        companyId,
        companyName,
        companyCode,
        warehouse: provision.warehouse,
        cashAccount: provision.cashAccount,
      });
      const linked = [
        provision.warehouse.selectedId ? "ditautkan" : "dibuat",
        provision.cashAccount.selectedId ? "ditautkan" : "dibuat",
      ];
      setProvisionMsg(
        `Gudang entitas "${result.warehouse.name}", sementara "${result.transitWarehouse.name}", rusak "${result.damagedWarehouse.name}"` +
          (result.cashAccount
            ? `, rekening "${result.cashAccount.name}" (${linked[1]})`
            : "") +
          " — otomatis terkunci per entitas (tidak bisa dihapus).",
      );
      setStackComplete(true);
      return true;
    } catch (provErr) {
      setProvisionMsg(
        provErr instanceof Error
          ? `Setup modul gagal: ${provErr.message}`
          : "Setup modul gagal — coba lagi atau lengkapi manual.",
      );
      return false;
    } finally {
      setProvisioning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNew && !provisionFormIsValid(provision, form.company_name)) {
      alert("Pilih atau buat gudang utama dan rekening utama sebelum simpan entitas.");
      return;
    }
    if (!isNew && selectedId && form.is_active === false) {
      const otherActive = await countActiveCompanyProfiles(selectedId);
      if (otherActive === 0) {
        alert("Minimal satu entitas harus tetap aktif.");
        return;
      }
    }
    setSaving(true);
    setSaved(false);
    try {
      const savedEntity = await saveCompanyProfile(form, isNew ? undefined : selectedId ?? undefined);
      if (
        prevNpwp &&
        (prevNpwp.show !== form.show_npwp_on_documents || prevNpwp.mode !== form.npwp_display_mode)
      ) {
        void writeAuditLog({
          module: "settings",
          action: "update",
          entity_type: "biz_company_profile",
          entity_label: form.company_name,
          summary: "Ubah pengaturan tampilan NPWP dokumen",
          changes: [
            { field: "show_npwp_on_documents", before: prevNpwp.show, after: form.show_npwp_on_documents },
            { field: "npwp_display_mode", before: prevNpwp.mode, after: form.npwp_display_mode },
          ],
        });
      }
      setSelectedId(savedEntity.id);
      setSaved(true);

      if (isNew) {
        await runProvision(savedEntity.id, savedEntity.company_name, savedEntity.code);
      }

      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t("pengaturan.common.errSave"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/pengaturan" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" />
          {t("pengaturan.common.back")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{t("pengaturan.perusahaan.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kelola entitas perusahaan — saat entitas baru dibuat, sistem otomatis menyiapkan gudang entitas, sementara, rusak, dan rekening bank (masing-masing satu per entitas).
        </p>
      </div>

      {schemaMissing ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {t("pengaturan.perusahaan.schemaHint")}{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs">npm run pb:company-schema</code> lalu{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs">node scripts/fix-pb-multi-entity.mjs</code>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Entitas</p>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Nonaktif
              </label>
            </div>
            {visibleEntities.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => selectEntity(e.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  selectedId === e.id
                    ? "bg-indigo-50 font-semibold text-indigo-800"
                    : e.is_active === false
                      ? "text-slate-400 hover:bg-slate-50"
                      : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {e.code ? `${e.code} — ` : ""}
                  {e.company_name}
                </span>
                {e.is_active === false ? (
                  <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                    Nonaktif
                  </span>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              onClick={() => selectEntity("__new__")}
              className={`flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-left text-sm transition ${
                isNew ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-indigo-200"
              }`}
            >
              <Plus className="h-4 w-4" />
              Tambah Entitas
            </button>
          </div>

          {(selectedId || isNew) && (
            <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {saved ? <p className="text-sm font-medium text-emerald-600">{t("pengaturan.perusahaan.saved")}</p> : null}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-slate-600">Kode entitas</span>
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="SDI"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">{t("pengaturan.perusahaan.companyName")}</span>
                  <input
                    required
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-slate-600">{t("pengaturan.perusahaan.legalName")}</span>
                <input
                  value={form.legal_name}
                  onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">{t("pengaturan.perusahaan.npwp")}</span>
                <input
                  value={form.npwp}
                  onChange={(e) => setForm({ ...form, npwp: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">{t("pengaturan.perusahaan.npwpSection")}</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.show_npwp_on_documents}
                    onChange={(e) => setForm({ ...form, show_npwp_on_documents: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  {t("pengaturan.perusahaan.npwpShow")}
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">{t("pengaturan.perusahaan.npwpPosition")}</span>
                  <select
                    value={form.npwp_display_mode}
                    onChange={(e) => setForm({ ...form, npwp_display_mode: e.target.value as NpwpDisplayMode })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="footer">{t("pengaturan.perusahaan.npwpFooter")}</option>
                    <option value="header_secondary">{t("pengaturan.perusahaan.npwpHeader")}</option>
                  </select>
                </label>
                <p className="text-xs text-slate-500">{t("pengaturan.perusahaan.npwpHint")}</p>
              </div>

              <label className="block text-sm">
                <span className="text-slate-600">{t("pengaturan.perusahaan.address")}</span>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-slate-600">{t("pengaturan.perusahaan.city")}</span>
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">{t("pengaturan.perusahaan.phone")}</span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-slate-600">{t("pengaturan.perusahaan.email")}</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">{t("pengaturan.perusahaan.website")}</span>
                <input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              {!isNew && selectedId ? (
                <EntityLogoSection
                  entityId={selectedId}
                  companyName={form.company_name || "Entitas"}
                  logoFilename={entities.find((e) => e.id === selectedId)?.logo}
                  updated={entities.find((e) => e.id === selectedId)?.updated}
                  onChanged={() => void load()}
                />
              ) : null}

              {!isNew ? (
                <div
                  className={`rounded-xl border p-4 ${
                    form.is_active ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => {
                        const next = e.target.checked;
                        if (!next) {
                          const activeOthers = entities.filter(
                            (x) => x.id !== selectedId && x.is_active !== false,
                          );
                          if (activeOthers.length === 0) {
                            alert("Minimal satu entitas harus tetap aktif.");
                            return;
                          }
                          if (
                            !window.confirm(
                              "Nonaktifkan entitas ini?\n\nEntitas tidak muncul di filter kerja dan tidak bisa dipilih untuk transaksi baru. Data historis tetap ada.",
                            )
                          ) {
                            return;
                          }
                        }
                        setForm({ ...form, is_active: next });
                      }}
                      className="mt-0.5 rounded border-slate-300"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {form.is_active ? "Entitas aktif" : "Entitas nonaktif"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {form.is_active
                          ? "Entitas dipakai untuk operasional dan filter data."
                          : "Entitas tidak dipakai lagi — aktifkan kembali jika diperlukan."}
                      </p>
                    </div>
                  </label>
                </div>
              ) : null}

              {isNew ? (
                <EntitySetupFormSection
                  mode="create"
                  companyName={form.company_name}
                  value={provision}
                  onChange={setProvision}
                />
              ) : selectedId ? (
                <EntitySetupFormSection
                  mode="edit"
                  companyId={selectedId}
                  companyName={form.company_name}
                  stackComplete={stackComplete}
                  provision={provision}
                  onProvisionChange={setProvision}
                  provisioning={provisioning}
                  onProvisionClick={async () => {
                    const e = entities.find((x) => x.id === selectedId);
                    if (!e) return;
                    const ok = await runProvision(e.id, e.company_name, e.code);
                    if (ok) await load();
                  }}
                />
              ) : null}

              {provisionMsg ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {provisionMsg}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={saving || provisioning}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? t("pengaturan.common.saving") : t("common.save")}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
