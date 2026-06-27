"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Landmark, Loader2, Pencil, Warehouse } from "lucide-react";
import {
  fetchAvailableModules,
  fetchEntityModules,
  moduleOptionSub,
  WAREHOUSE_ROLE_LABELS,
  type AvailableModules,
  type EntityModules,
  type ModuleListItem,
} from "@/lib/bisnis/entity-modules";
import type { EntityProvisionForm, ModuleSelection } from "@/lib/bisnis/entity-provision";

export type { EntityProvisionForm } from "@/lib/bisnis/entity-provision";

type CreateProps = {
  mode: "create";
  companyName: string;
  companyId?: string;
  value: EntityProvisionForm;
  onChange: (next: EntityProvisionForm) => void;
};

type EditProps = {
  mode: "edit";
  companyId: string;
  companyName: string;
  stackComplete: boolean | null;
  provision?: EntityProvisionForm;
  onProvisionChange?: (next: EntityProvisionForm) => void;
  onProvisionClick?: () => void;
  provisioning?: boolean;
};

type Props = CreateProps | EditProps;

export function EntitySetupFormSection(props: Props) {
  if (props.mode === "create") {
    return <CreateSection {...props} />;
  }
  return <EditSection {...props} />;
}

function CreateSection({ companyName, companyId, value, onChange }: CreateProps) {
  return (
    <ModuleSetupFields
      companyName={companyName}
      companyId={companyId}
      value={value}
      onChange={onChange}
      title="Modul operasional entitas"
      description={
        <>
          Satu entitas = <strong>satu gudang</strong> (penerimaan pembelian &amp; penyimpanan WMS) +{" "}
          <strong>satu rekening bank</strong> (pembayaran pembelian). Pilih modul yang belum punya entitas atau
          buat baru sebelum simpan.
        </>
      }
    />
  );
}

function EditSection({
  companyId,
  companyName,
  stackComplete,
  provision,
  onProvisionChange,
  onProvisionClick,
  provisioning,
}: EditProps) {
  const [mods, setMods] = useState<EntityModules | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setMods(await fetchEntityModules(companyId));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!mods || stackComplete !== false || !onProvisionChange || !provision) return;
    const empty =
      !provision.warehouse.selectedId &&
      !provision.cashAccount.selectedId;
    if (!empty) return;
    onProvisionChange({
      store: provision.store,
      warehouse: {
        selectedId: mods.primaryWarehouse?.id ?? "",
        newName: mods.primaryWarehouse?.name ?? provision.warehouse.newName,
      },
      cashAccount: {
        selectedId: mods.primaryCashAccount?.id ?? "",
        newName: mods.primaryCashAccount?.name ?? provision.cashAccount.newName,
      },
    });
  }, [mods, stackComplete, onProvisionChange, provision]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat modul operasional…
      </div>
    );
  }

  const extraWarehouses = (mods?.warehouses.length ?? 0) - (mods?.primaryWarehouse ? 1 : 0);
  const extraCash = (mods?.cashAccounts.length ?? 0) - (mods?.primaryCashAccount ? 1 : 0);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">Modul operasional — {companyName}</p>
        <p className="mt-1 text-xs text-slate-500">
          Satu gudang + satu rekening bank per entitas. Modul terkunci pada entitas ini setelah ditautkan.
        </p>
      </div>

      {stackComplete === false && provision && onProvisionChange ? (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            Entitas belum punya gudang/rekening — pilih modul yang tersedia atau buat baru.
          </p>
          <ModuleSetupFields
            companyName={companyName}
            companyId={companyId}
            value={provision}
            onChange={onProvisionChange}
          />
          {onProvisionClick ? (
            <button
              type="button"
              disabled={provisioning}
              onClick={onProvisionClick}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {provisioning ? "Memproses…" : "Tautkan / buat modul operasional"}
            </button>
          ) : null}
        </div>
      ) : null}

      {mods ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <EntityModuleCard
            icon={Warehouse}
            title="Gudang entitas"
            emptyHint="Belum ada gudang"
            editHref="/gudang/daftar"
            item={
              mods.primaryWarehouse
                ? {
                    label: mods.primaryWarehouse.name,
                    sub:
                      WAREHOUSE_ROLE_LABELS[mods.primaryWarehouse.warehouse_role ?? "main"] ??
                      "Penerimaan pembelian — keluar via Transfer Gudang",
                  }
                : null
            }
          />
          <EntityModuleCard
            icon={Landmark}
            title="Rekening bank entitas"
            emptyHint="Belum ada rekening"
            editHref="/keuangan/kas-bank"
            item={
              mods.primaryCashAccount
                ? {
                    label: mods.primaryCashAccount.name,
                    sub: "Pembayaran pembelian & biaya entitas",
                  }
                : null
            }
          />
        </div>
      ) : null}

      {extraWarehouses > 0 || extraCash > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Ada modul tambahan lama ({extraWarehouses > 0 ? `${extraWarehouses} gudang` : ""}
          {extraWarehouses > 0 && extraCash > 0 ? ", " : ""}
          {extraCash > 0 ? `${extraCash} rekening` : ""}) — sistem memakai satu gudang dan satu rekening utama
          per entitas.
        </p>
      ) : null}

      {mods && !mods.primaryWarehouse ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Belum ada <strong>gudang</strong> — pembelian entitas ini tidak bisa diposting dengan benar.
        </p>
      ) : null}
      {mods && !mods.primaryCashAccount ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Belum ada <strong>rekening bank</strong> — pembayaran pembelian membutuhkan rekening entitas.
        </p>
      ) : null}
    </div>
  );
}

function ModuleSetupFields({
  companyName,
  companyId,
  value,
  onChange,
  title,
  description,
}: {
  companyName: string;
  companyId?: string;
  value: EntityProvisionForm;
  onChange: (next: EntityProvisionForm) => void;
  title?: string;
  description?: React.ReactNode;
}) {
  const [available, setAvailable] = useState<AvailableModules | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchAvailableModules(companyId)
      .then(setAvailable)
      .finally(() => setLoading(false));
  }, [companyId]);

  const setMod = (key: keyof EntityProvisionForm, sel: ModuleSelection) =>
    onChange({ ...value, [key]: sel });

  const countSelectable = (items: ModuleListItem[]) => items.filter((i) => i.selectable).length;

  return (
    <div className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      {title ? (
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {description ? <p className="mt-1 text-xs text-slate-600">{description}</p> : null}
        </div>
      ) : null}

      {!loading && available ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          Modul yang sudah terikat entitas lain tidak bisa dipilih. Tersedia:{" "}
          {countSelectable(available.warehouses)} gudang, {countSelectable(available.cashAccounts)} rekening.
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Memuat daftar modul…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <ModulePicker
            icon={Warehouse}
            label="Gudang entitas"
            hint="Penerimaan pembelian saja — satu per entitas, keluar via Transfer Gudang"
            selection={value.warehouse}
            onChange={(s) => setMod("warehouse", s)}
            items={available?.warehouses ?? []}
            entityCompanyId={companyId}
            labelFor={(w) => `${w.code ?? ""}${w.code ? " — " : ""}${w.name}`}
            newPlaceholder="Gudang Utama"
          />
          <ModulePicker
            icon={Landmark}
            label="Rekening bank entitas"
            hint="Pembayaran pembelian — satu per entitas"
            selection={value.cashAccount}
            onChange={(s) => setMod("cashAccount", s)}
            items={available?.cashAccounts ?? []}
            entityCompanyId={companyId}
            labelFor={(c) => `${c.code ?? ""}${c.code ? " — " : ""}${c.name}`}
            newPlaceholder={companyName ? `Rekening ${companyName}` : "Rekening bank baru"}
          />
        </div>
      )}
    </div>
  );
}

function ModulePicker({
  icon: Icon,
  label,
  hint,
  selection,
  onChange,
  items,
  entityCompanyId,
  labelFor,
  newPlaceholder,
}: {
  icon: typeof Warehouse;
  label: string;
  hint: string;
  selection: ModuleSelection;
  onChange: (sel: ModuleSelection) => void;
  items: ModuleListItem[];
  entityCompanyId?: string;
  labelFor: (item: ModuleListItem) => string;
  newPlaceholder: string;
}) {
  const isNew = !selection.selectedId;
  const selected = items.find((i) => i.id === selection.selectedId);
  const selectableCount = items.filter((i) => i.selectable).length;

  return (
    <div className="block text-sm">
      <span className="flex items-center gap-1.5 font-medium text-slate-800">
        <Icon className="h-4 w-4 text-indigo-600" />
        {label}
        <span className="text-red-500">*</span>
      </span>

      <select
        value={selection.selectedId}
        onChange={(e) => onChange({ ...selection, selectedId: e.target.value })}
        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        <option value="">+ Buat baru…</option>
        {items.map((item) => (
          <option key={item.id} value={item.id} disabled={!item.selectable}>
            {labelFor(item)} — {moduleOptionSub(item, entityCompanyId)}
          </option>
        ))}
      </select>

      {selectableCount === 0 && items.length > 0 ? (
        <p className="mt-1 text-xs text-amber-700">
          Semua sudah terikat entitas lain — pilih <strong>Buat baru</strong>.
        </p>
      ) : null}

      {isNew ? (
        <input
          required
          value={selection.newName}
          onChange={(e) => onChange({ ...selection, newName: e.target.value })}
          placeholder={newPlaceholder}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      ) : selected ? (
        <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs text-slate-700">
          <p className="font-medium text-slate-800">{labelFor(selected)}</p>
          <p className="mt-0.5 text-slate-600">{moduleOptionSub(selected, entityCompanyId)}</p>
          {selected.selectable ? (
            <p className="mt-1 text-indigo-700">Akan ditautkan ke entitas ini.</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Modul terpilih akan ditautkan &amp; dikunci ke entitas ini.
        </p>
      )}

      <span className="mt-1 block text-xs text-slate-500">{hint}</span>
    </div>
  );
}

function EntityModuleCard({
  icon: Icon,
  title,
  emptyHint,
  editHref,
  item,
}: {
  icon: typeof Warehouse;
  title: string;
  emptyHint: string;
  editHref: string;
  item: { label: string; sub: string } | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Icon className="h-4 w-4 text-indigo-600" />
          {title}
        </span>
        {item ? (
          <Link
            href={editHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Link>
        ) : null}
      </div>
      {item ? (
        <div className="text-sm text-slate-700">
          <p className="font-medium">{item.label}</p>
          <p className="mt-0.5 text-xs text-slate-400">{item.sub}</p>
        </div>
      ) : (
        <p className="text-xs text-slate-400">{emptyHint}</p>
      )}
    </div>
  );
}
