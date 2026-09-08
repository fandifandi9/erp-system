"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { useWorkContext } from "@/components/WorkContextProvider";
import { EntityScopeFilter, companyNameById } from "@/components/bisnis/EntityScopeFilter";
import type { CompanyProfile, Store } from "@/lib/bisnis/types";
import {
  createMovementDraft,
  fetchProducts,
} from "@/lib/inventory/client";
import { canPostInventoryMovement } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import type { InvProduct, InvWarehouse } from "@/lib/inventory/types";
import {
  canonicalEntityWarehouses,
  countScopedWarehouses,
  defaultManualTransferPair,
  describeTransferPair,
  filterWarehousesForCompany,
  groupWarehousesByKind,
  manualTransferFromOptions,
  manualTransferToOptions,
  validateManualTransfer,
  warehouseCompanyId,
  warehouseSelectLabel,
} from "@/lib/inventory/transfer-suggest";
import { resolveWarehouseKind } from "@/lib/bisnis/warehouse-categories";
import { Loader2, Plus, Trash2, ArrowRightLeft } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

type LineForm = { product: string; qty: string };

export default function NewMovementPage() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillFrom = searchParams.get("from") ?? "";
  const prefillTo = searchParams.get("to") ?? "";
  const prefillCompany = searchParams.get("company") ?? "";
  const { context: workCtx, companies: ctxCompanies, stores: ctxStores, warehouses: ctxWarehouses, loading: ctxLoading } =
    useWorkContext();

  const user = pb.authStore.model;
  const canPostNow = user && canPostInventoryMovement(user);

  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [scopeCompanyId, setScopeCompanyId] = useState("");
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [toWarehouse, setToWarehouse] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([{ product: "", qty: "1" }]);
  const [alsoPost, setAlsoPost] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const scopeUserPicked = useRef(false);
  const dataLoaded = useRef(false);

  const storeRows = useMemo(
    () => stores.map((s) => ({ id: s.id, name: s.name, company: s.company })),
    [stores],
  );

  const activeCompanyId = scopeCompanyId || undefined;

  const activeCompanyIds = useMemo(() => new Set(companies.map((c) => c.id)), [companies]);

  const activeWarehouses = useMemo(() => {
    const filtered = warehouses.filter((w) => {
      if (w.is_active === false) return false;
      const cid = warehouseCompanyId(w, storeRows);
      return !cid || activeCompanyIds.has(cid);
    });
    const canonicalEntityIds = new Set(
      canonicalEntityWarehouses(filtered, undefined, storeRows).map((w) => w.id),
    );
    return filtered.filter(
      (w) => resolveWarehouseKind(w) !== "entity" || canonicalEntityIds.has(w.id),
    );
  }, [warehouses, storeRows, activeCompanyIds]);

  const scopedWarehouses = useMemo(
    () => filterWarehousesForCompany(activeWarehouses, activeCompanyId, storeRows),
    [activeWarehouses, activeCompanyId, storeRows],
  );

  const whCounts = useMemo(
    () => countScopedWarehouses(activeWarehouses, activeCompanyId, storeRows),
    [activeWarehouses, activeCompanyId, storeRows],
  );

  const fromOptions = useMemo(
    () => manualTransferFromOptions(activeWarehouses, activeCompanyId, storeRows),
    [activeWarehouses, activeCompanyId, storeRows],
  );

  const toOptions = useMemo(
    () => manualTransferToOptions(activeWarehouses, warehouse, activeCompanyId, storeRows),
    [activeWarehouses, warehouse, activeCompanyId, storeRows],
  );

  const fromGroups = useMemo(() => groupWarehousesByKind(fromOptions), [fromOptions]);
  const toGroups = useMemo(() => groupWarehousesByKind(toOptions), [toOptions]);

  const pairHint = useMemo(() => {
    if (!warehouse || !toWarehouse) return null;
    return describeTransferPair(warehouse, toWarehouse, scopedWarehouses);
  }, [warehouse, toWarehouse, scopedWarehouses]);

  const entityLabelFor = (w: InvWarehouse) => {
    if (scopeCompanyId) return undefined;
    const cid = warehouseCompanyId(w, storeRows);
    return companyNameById(companies, cid);
  };

  const applyDefaults = (companyFilter?: string) => {
    const pair = defaultManualTransferPair(
      activeWarehouses,
      companyFilter,
      storeRows,
      workCtx?.warehouseId,
    );
    setWarehouse(pair.fromId);
    setToWarehouse(pair.toId);
  };

  const loadProducts = async () => {
    const p = await fetchProducts();
    setProducts(p.items as unknown as InvProduct[]);
  };

  useEffect(() => {
    if (ctxLoading) return;
    setCompanies(
      ctxCompanies.map(
        (c) =>
          ({
            id: c.id,
            company_name: c.name,
            code: c.code,
          }) as CompanyProfile,
      ),
    );
    setStores(
      ctxStores.map(
        (s) =>
          ({
            id: s.id,
            name: s.name,
            code: s.code,
            company: s.company,
          }) as Store,
      ),
    );
    setWarehouses(ctxWarehouses as unknown as InvWarehouse[]);
    dataLoaded.current = true;
  }, [ctxLoading, ctxCompanies, ctxStores, ctxWarehouses]);

  useEffect(() => {
    void loadProducts();
  }, []);

  useEffect(() => {
    if (prefillCompany) {
      setScopeCompanyId(prefillCompany);
      scopeUserPicked.current = true;
      return;
    }
    if (!scopeUserPicked.current && workCtx?.companyId) {
      setScopeCompanyId(workCtx.companyId);
    }
  }, [workCtx?.companyId, prefillCompany]);

  useEffect(() => {
    if (!dataLoaded.current || activeWarehouses.length === 0) return;

    const fromValid = warehouse && fromOptions.some((w) => w.id === warehouse);
    const toValid = toWarehouse && toOptions.some((w) => w.id === toWarehouse);
    if (fromValid && toValid) return;

    if (prefillFrom && fromOptions.some((w) => w.id === prefillFrom)) {
      const toOpts = manualTransferToOptions(
        activeWarehouses,
        prefillFrom,
        activeCompanyId,
        storeRows,
      );
      const toId =
        prefillTo && toOpts.some((w) => w.id === prefillTo) ? prefillTo : toOpts[0]?.id ?? "";
      setWarehouse(prefillFrom);
      if (toId) setToWarehouse(toId);
      return;
    }

    applyDefaults(activeCompanyId);
  }, [
    activeWarehouses,
    activeCompanyId,
    fromOptions,
    toOptions,
    warehouse,
    toWarehouse,
    prefillFrom,
    prefillTo,
    workCtx?.warehouseId,
  ]);

  const handleScopeChange = (nextCompanyId: string) => {
    scopeUserPicked.current = true;
    setScopeCompanyId(nextCompanyId);
    setError("");
    applyDefaults(nextCompanyId || undefined);
  };

  const handleFromChange = (next: string) => {
    setWarehouse(next);
    if (toWarehouse === next) {
      setToWarehouse(
        manualTransferToOptions(activeWarehouses, next, activeCompanyId, storeRows)[0]?.id ?? "",
      );
    }
  };

  const addLine = () => setLines([...lines, { product: "", qty: "1" }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));

  const renderOptions = (
    groups: ReturnType<typeof groupWarehousesByKind>,
    excludeId?: string,
  ) =>
    groups.map((group) => (
      <optgroup key={group.kind} label={group.label}>
        {group.items
          .filter((w) => w.id !== excludeId)
          .map((w) => (
            <option key={w.id} value={w.id}>
              {warehouseSelectLabel(w, storeRows, entityLabelFor(w))}
            </option>
          ))}
      </optgroup>
    ));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateManualTransfer(
      warehouse,
      toWarehouse,
      activeWarehouses,
      activeCompanyId,
      storeRows,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    const parsed = lines
      .map((l) => ({ product: l.product, qty: Number(l.qty) }))
      .filter((l) => l.product && l.qty > 0);
    if (parsed.length === 0) {
      setError("Minimal satu baris produk valid.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await createMovementDraft({
        movement_type: "TRANSFER",
        warehouse,
        from_warehouse: warehouse,
        to_warehouse: toWarehouse,
        notes: notes.trim() || "Transfer manual antar gudang",
        lines: parsed,
        post: Boolean(alsoPost && canPostNow),
      });
      router.push(
        `/inventory/movements/${created.id}${created.status === "posted" ? "?posted=1" : ""}`,
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title={t("inventory.movements.newTitle")}
        subtitle={t("inventory.movements.newSubtitle")}
      >
        <Link href="/inventory/movements" className="text-sm text-indigo-600 hover:underline">
          ← Kembali
        </Link>

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Transfer stok antar gudang entitas, toko, sementara, atau rusak. Pembelian dan penjualan
          tetap otomatis lewat modul bisnis. Stok di katalog baru berubah setelah mutasi{" "}
          <strong>diposting</strong> (centang &quot;Langsung posting&quot; atau posting dari halaman
          detail mutasi).
        </div>

        {companies.length > 0 ? (
          <EntityScopeFilter
            companies={companies}
            value={scopeCompanyId}
            onChange={handleScopeChange}
            shownCount={scopedWarehouses.length}
            totalCount={activeWarehouses.length}
            noun="gudang"
          />
        ) : null}

        <form
          onSubmit={submit}
          className="max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {activeCompanyId ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Entitas: <strong>{companyNameById(companies, activeCompanyId) ?? activeCompanyId}</strong> —{" "}
              {whCounts.total} gudang ({whCounts.entity} gudang entitas, {whCounts.transit} sementara,{" "}
              {whCounts.damaged} rusak, {whCounts.sales} penjualan).
            </div>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Mode <strong>semua entitas</strong> — {companies.length} entitas aktif,{" "}
              {scopedWarehouses.length} gudang. Pilih entitas di filter untuk membatasi daftar.
            </p>
          )}

          {fromOptions.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Belum ada gudang — setup di Pengaturan → Perusahaan / Toko.
            </p>
          ) : null}

          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">{t("inventory.movements.from")}</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={warehouse}
                onChange={(e) => handleFromChange(e.target.value)}
                required
              >
                <option value="">{t("inventory.movements.selectFrom")}</option>
                {renderOptions(fromGroups)}
              </select>
            </label>

            <div className="hidden pb-2 text-indigo-500 sm:block" aria-hidden>
              <ArrowRightLeft className="h-5 w-5" />
            </div>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">{t("inventory.movements.to")}</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={toWarehouse}
                onChange={(e) => setToWarehouse(e.target.value)}
                required
                disabled={!warehouse}
              >
                <option value="">{t("inventory.movements.selectTo")}</option>
                {renderOptions(toGroups, warehouse)}
              </select>
            </label>
          </div>

          {pairHint ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Alur: <strong>{pairHint}</strong>
            </p>
          ) : null}

          <label className="block text-sm">
            {t("inventory.common.note")}
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsional"
            />
          </label>

          <div>
            <p className="text-sm font-medium text-slate-700">{t("inventory.common.product")}</p>
            <div className="mt-2 space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <select
                    className="min-w-[200px] flex-1 rounded-lg border px-2 py-2 text-sm"
                    value={line.product}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], product: e.target.value };
                      setLines(next);
                    }}
                    required
                  >
                    <option value="">{t("inventory.common.select")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0.0001}
                    step="any"
                    className="w-24 rounded-lg border px-2 py-2 text-sm"
                    value={line.qty}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], qty: e.target.value };
                      setLines(next);
                    }}
                    required
                  />
                  <button type="button" onClick={() => removeLine(i)} className="p-2 text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLine}
              className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600"
            >
              <Plus className="h-4 w-4" /> Tambah baris
            </button>
          </div>

          {canPostNow ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={alsoPost} onChange={(e) => setAlsoPost(e.target.checked)} />
              Langsung posting setelah simpan
            </label>
          ) : (
            <p className="text-xs text-slate-500">Draf disimpan; supervisor/admin yang mem-posting.</p>
          )}

          <button
            type="submit"
            disabled={saving || fromOptions.length === 0 || toOptions.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("inventory.common.loading")}
              </span>
            ) : (
              t("inventory.movements.save")
            )}
          </button>
        </form>
      </InventoryShell>
    </InventoryGate>
  );
}
