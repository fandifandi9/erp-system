"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  Trash2,
  Wrench,
} from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { fetchCompanyProfiles } from "@/lib/bisnis/company-client";
import type { CompanyProfile } from "@/lib/bisnis/types";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  canPostInventoryMovement,
  isInventorySupervisorOrAbove,
} from "@/lib/inventory/access";
import {
  fetchDamagedWarehouseStock,
  postDamagedDisposition,
  postDamagedReassign,
  type DamagedWriteOffExpense,
} from "@/lib/inventory/client";
import {
  damagedStockRowKey,
  type DamagedStockRow,
  type RetailWarehouseOption,
} from "@/lib/inventory/damaged-disposition";
import type { DamagedIntakeRef } from "@/lib/inventory/damaged-intake-refs";
import { getErrorMessage } from "@/lib/errors";
import { formatIntegerId } from "@/lib/format-number";
import { pb } from "@/lib/pocketbase";

type QtyDraft = Record<string, string>;

type LineGroup = {
  warehouseId: string;
  companyId: string;
  lines: { product: string; qty: number }[];
};

type RepairModal = {
  action: "repair";
  rowKeys: string[];
};

type WriteOffModal = {
  action: "write_off";
  rowKeys: string[];
};

type ReassignModal = {
  action: "reassign";
  rowKeys: string[];
  fromWarehouseId: string;
};

type ModalState = RepairModal | WriteOffModal | ReassignModal;

function rowKey(row: DamagedStockRow): string {
  return damagedStockRowKey(row.warehouseId, row.productId);
}

const fmtIdr = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

export default function GudangServisRusakPage() {
  const { t } = useLocale();
  const user = pb.authStore.model;
  const canPost = user ? canPostInventoryMovement(user) : false;
  const isSupervisor = user ? isInventorySupervisorOrAbove(user) : false;

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [expenseDraft, setExpenseDraft] = useState<DamagedWriteOffExpense | null>(null);
  const [writeOffHint, setWriteOffHint] = useState(false);

  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [items, setItems] = useState<DamagedStockRow[]>([]);
  const [warehouses, setWarehouses] = useState<
    { id: string; code: string; name: string; companyId: string }[]
  >([]);
  const [intakeRefs, setIntakeRefs] = useState<Record<string, DamagedIntakeRef[]>>({});
  const [retailByCompany, setRetailByCompany] = useState<Record<string, RetailWarehouseOption[]>>({});
  const [qtyDraft, setQtyDraft] = useState<QtyDraft>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [modal, setModal] = useState<ModalState | null>(null);
  const [note, setNote] = useState("");
  const [repairTarget, setRepairTarget] = useState<"entity" | "retail">("entity");
  const [targetWarehouseId, setTargetWarehouseId] = useState("");
  const [reassignToWarehouseId, setReassignToWarehouseId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchDamagedWarehouseStock({
        companyId: companyId || undefined,
        warehouseId: warehouseId || undefined,
      });
      setWarehouses(res.warehouses);
      setItems(res.items);
      setIntakeRefs(res.intakeRefs);
      setRetailByCompany(res.retailByCompany);
      setQtyDraft((prev) => {
        const next: QtyDraft = {};
        for (const row of res.items) {
          const key = rowKey(row);
          next[key] = prev[key] ?? String(row.qtyOnHand);
        }
        return next;
      });
      setSelected(new Set());
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [companyId, warehouseId]);

  useEffect(() => {
    void fetchCompanyProfiles(true)
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const companyName = (id: string) =>
    companies.find((c) => c.id === id)?.company_name ?? t("wms.damagedService.filterEntity");

  const filteredWarehouses = useMemo(() => {
    if (!companyId) return warehouses;
    return warehouses.filter((w) => w.companyId === companyId);
  }, [warehouses, companyId]);

  const visibleItems = useMemo(() => {
    if (!warehouseId) return items;
    return items.filter((i) => i.warehouseId === warehouseId);
  }, [items, warehouseId]);

  const itemByKey = useMemo(() => {
    const map = new Map<string, DamagedStockRow>();
    for (const row of visibleItems) map.set(rowKey(row), row);
    return map;
  }, [visibleItems]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(visibleItems.map(rowKey)));
  };

  const buildLineGroups = (keys: string[]): LineGroup[] => {
    const byWh = new Map<string, LineGroup>();
    for (const key of keys) {
      const row = itemByKey.get(key);
      if (!row) continue;
      const qty = Number(qtyDraft[key]) || 0;
      if (qty <= 0) continue;

      let group = byWh.get(row.warehouseId);
      if (!group) {
        group = { warehouseId: row.warehouseId, companyId: row.companyId, lines: [] };
        byWh.set(row.warehouseId, group);
      }
      group.lines.push({ product: row.productId, qty });
    }
    return [...byWh.values()].filter((g) => g.lines.length > 0);
  };

  const openRepairModal = (keys: string[]) => {
    if (!canPost) return;
    if (buildLineGroups(keys).length === 0) {
      setError(t("wms.damagedService.errQty"));
      return;
    }
    setNote("");
    setRepairTarget("entity");
    setTargetWarehouseId("");
    setModal({ action: "repair", rowKeys: keys });
  };

  const openWriteOffModal = (keys: string[]) => {
    if (!canPost) return;
    if (buildLineGroups(keys).length === 0) {
      setError(t("wms.damagedService.errQty"));
      return;
    }
    setNote("");
    setModal({ action: "write_off", rowKeys: keys });
  };

  const openReassignModal = (keys: string[]) => {
    if (!isSupervisor) return;
    const groups = buildLineGroups(keys);
    if (groups.length === 0) {
      setError(t("wms.damagedService.errQty"));
      return;
    }
    if (groups.length > 1) {
      setError(t("wms.damagedService.errReassignSameWh"));
      return;
    }
    setNote("");
    setReassignToWarehouseId("");
    setModal({
      action: "reassign",
      rowKeys: keys,
      fromWarehouseId: groups[0].warehouseId,
    });
  };

  const repairCompanyId = useMemo(() => {
    if (!modal || modal.action !== "repair") return "";
    const row = itemByKey.get(modal.rowKeys[0]);
    return row?.companyId ?? companyId;
  }, [modal, itemByKey, companyId]);

  const retailOptions = useMemo(() => {
    if (!repairCompanyId) return [];
    return retailByCompany[repairCompanyId] ?? [];
  }, [retailByCompany, repairCompanyId]);

  useEffect(() => {
    if (repairTarget === "retail" && retailOptions.length === 1) {
      setTargetWarehouseId(retailOptions[0].id);
    }
  }, [repairTarget, retailOptions]);

  const reassignTargets = useMemo(() => {
    if (!modal || modal.action !== "reassign") return [];
    return warehouses.filter((w) => w.id !== modal.fromWarehouseId);
  }, [modal, warehouses]);

  const submitModal = async () => {
    if (!modal) return;

    setProcessing(true);
    setError("");
    setExpenseDraft(null);
    setWriteOffHint(false);

    try {
      if (modal.action === "reassign") {
        const groups = buildLineGroups(modal.rowKeys);
        if (groups.length !== 1) {
          throw new Error(t("wms.damagedService.errReassignSameWh"));
        }
        if (!reassignToWarehouseId) {
          throw new Error(t("wms.damagedService.errReassignTarget"));
        }
        if (note.trim().length < 5) {
          throw new Error(t("wms.damagedService.errReassignNote"));
        }
        await postDamagedReassign({
          fromDamagedWarehouseId: modal.fromWarehouseId,
          toDamagedWarehouseId: reassignToWarehouseId,
          lines: groups[0].lines,
          note: note.trim(),
        });
        setToast(t("wms.damagedService.toastReassign"));
        setTimeout(() => setToast(""), 3500);
        setModal(null);
        await load();
        return;
      }

      const groups = buildLineGroups(modal.rowKeys);
      if (groups.length === 0) {
        throw new Error(t("wms.damagedService.errQty"));
      }

      if (modal.action === "repair" && repairTarget === "retail" && !targetWarehouseId) {
        throw new Error(t("wms.damagedService.errRetailTarget"));
      }

      if (modal.action === "write_off" && note.trim().length < 5) {
        throw new Error(t("wms.damagedService.errWriteOffNote"));
      }

      let lastAccounting: DamagedWriteOffExpense | null = null;

      for (const group of groups) {
        const res = await postDamagedDisposition({
          action: modal.action,
          damagedWarehouseId: group.warehouseId,
          companyId: group.companyId,
          lines: group.lines,
          note: note.trim() || undefined,
          repairTarget: modal.action === "repair" ? repairTarget : undefined,
          targetWarehouseId:
            modal.action === "repair" && repairTarget === "retail" ? targetWarehouseId : undefined,
        });
        const acct = res.accounting ?? res.expense;
        if (acct) lastAccounting = acct;
      }

      if (modal.action === "repair") {
        setToast(
          repairTarget === "retail"
            ? t("wms.damagedService.toastRepairRetail")
            : t("wms.damagedService.toastRepairEntity"),
        );
        if (lastAccounting?.kind === "reversal") {
          setExpenseDraft(lastAccounting);
        }
      } else {
        setToast(t("wms.damagedService.toastWriteOff"));
        if (lastAccounting) setExpenseDraft(lastAccounting);
        else setWriteOffHint(true);
      }
      setTimeout(() => setToast(""), 3500);
      setModal(null);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setProcessing(false);
    }
  };

  const bulkRowKeys = [...selected];

  const formatIntake = (refs: DamagedIntakeRef[]) => {
    if (refs.length === 0) return "—";
    return refs.map((r) => r.label).join(" · ");
  };

  return (
    <InventoryGate>
      <InventoryShell title={t("wms.damagedService.title")}>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="mb-6">
            <p className="max-w-3xl text-sm text-slate-600">
              {t("wms.damagedService.subtitle")}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {t("wms.damagedService.linkSortir")}{" "}
              <Link href="/gudang/sortir" className="font-medium text-indigo-600 hover:underline">
                {t("wms.damagedService.linkSortirLabel")}
              </Link>
              {" · "}
              {t("wms.damagedService.linkWarehouse")}{" "}
              <Link href="/gudang/daftar" className="font-medium text-indigo-600 hover:underline">
                {t("wms.damagedService.linkWarehouseLabel")}
              </Link>
            </p>
          </div>

          {!canPost ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {t("wms.damagedService.viewOnly")}
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}
          {toast ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {toast}
              {expenseDraft ? (
                <span className="mt-1 block">
                  Draft{" "}
                  {expenseDraft.kind === "reversal"
                    ? t("wms.damagedService.draftRecovery")
                    : t("wms.damagedService.draftCost")}{" "}
                  <Link
                    href="/bisnis/biaya"
                    className="font-semibold text-emerald-900 underline hover:no-underline"
                  >
                    {expenseDraft.expenseNo}
                  </Link>{" "}
                  ({fmtIdr(Math.abs(expenseDraft.total))}
                  {expenseDraft.kind === "reversal" ? t("wms.damagedService.draftOffset") : ""}){" "}
                  {t("wms.damagedService.draftApprove")}
                  {expenseDraft.kind === "write_off" ? (
                    <span className="block text-xs text-emerald-700/90">
                      {t("wms.damagedService.draftDoubleWarn")}
                    </span>
                  ) : null}
                </span>
              ) : writeOffHint ? (
                <span className="mt-1 block text-xs text-emerald-700/90">
                  {t("wms.damagedService.draftWdHint")}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block min-w-[180px] flex-1 text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {t("wms.damagedService.filterEntity")}
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setWarehouseId("");
                }}
              >
                <option value="">{t("wms.damagedService.filterEntityAll")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-[200px] flex-1 text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {t("wms.damagedService.filterWarehouse")}
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="">{t("wms.damagedService.filterWarehouseAll")}</option>
                {filteredWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                    {!companyId ? ` (${companyName(w.companyId)})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {canPost && visibleItems.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t("wms.damagedService.selectAll")}
              </button>
              <button
                type="button"
                disabled={bulkRowKeys.length === 0 || processing}
                onClick={() => openRepairModal(bulkRowKeys)}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Wrench className="h-3.5 w-3.5" />
                {t("wms.damagedService.repairSelected")}
              </button>
              <button
                type="button"
                disabled={bulkRowKeys.length === 0 || processing}
                onClick={() => openWriteOffModal(bulkRowKeys)}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("wms.damagedService.writeOffSelected")}
              </button>
              {isSupervisor ? (
                <button
                  type="button"
                  disabled={bulkRowKeys.length === 0 || processing}
                  onClick={() => openReassignModal(bulkRowKeys)}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  {t("wms.damagedService.reassignSelected")}
                </button>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : filteredWarehouses.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rose-200 bg-rose-50/50 px-4 py-8 text-center text-sm text-rose-900">
              {t("wms.damagedService.emptyNoWarehouse")}{" "}
              <Link href="/gudang/daftar" className="font-semibold underline">
                {t("wms.damagedService.linkWarehouseLabel")}
              </Link>
              .
            </p>
          ) : visibleItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              {t("wms.damagedService.emptyNoStock")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {canPost ? <th className="w-10 px-3 py-3" /> : null}
                    <th className="px-3 py-3">{t("wms.damagedService.colProduct")}</th>
                    <th className="px-3 py-3">{t("wms.damagedService.colWarehouse")}</th>
                    <th className="px-3 py-3">{t("wms.damagedService.colIntake")}</th>
                    <th className="px-3 py-3 text-right">{t("wms.damagedService.colStock")}</th>
                    <th className="px-3 py-3 text-right">{t("wms.damagedService.colQty")}</th>
                    {canPost ? (
                      <th className="px-3 py-3 text-right">{t("wms.damagedService.colActions")}</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((row) => {
                    const key = rowKey(row);
                    const refs = intakeRefs[key] ?? [];
                    return (
                      <tr key={key} className="border-t border-slate-100">
                        {canPost ? (
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(key)}
                              onChange={() => toggleSelect(key)}
                              className="rounded border-slate-300"
                            />
                          </td>
                        ) : null}
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{row.name}</p>
                          <p className="font-mono text-xs text-slate-500">{row.sku}</p>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          {row.warehouseCode} — {row.warehouseName}
                          <span className="mt-0.5 block text-indigo-600">
                            {companyName(row.companyId)}
                          </span>
                        </td>
                        <td className="max-w-[220px] px-3 py-3 text-xs text-slate-500">
                          {formatIntake(refs)}
                        </td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums">
                          {formatIntegerId(row.qtyOnHand)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            max={row.qtyOnHand}
                            step={1}
                            disabled={!canPost}
                            value={qtyDraft[key] ?? String(row.qtyOnHand)}
                            onChange={(e) =>
                              setQtyDraft((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm"
                          />
                        </td>
                        {canPost ? (
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                title={t("wms.damagedService.tipRepair")}
                                onClick={() => openRepairModal([key])}
                                className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                              >
                                <Wrench className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                title={t("wms.damagedService.tipWriteOff")}
                                onClick={() => openWriteOffModal([key])}
                                className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              {isSupervisor ? (
                                <button
                                  type="button"
                                  title={t("wms.damagedService.tipReassign")}
                                  onClick={() => openReassignModal([key])}
                                  className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              {modal.action === "repair" ? (
                <>
                  <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    {t("wms.damagedService.repairTitle")}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {t("wms.damagedService.repairDesc")}
                  </p>
                  <fieldset className="mt-4 space-y-2">
                    <legend className="text-sm font-medium text-slate-700">
                      {t("wms.damagedService.repairTargetLegend")}
                    </legend>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="repairTarget"
                        checked={repairTarget === "entity"}
                        onChange={() => setRepairTarget("entity")}
                      />
                      {t("wms.damagedService.repairTargetEntity")}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="repairTarget"
                        checked={repairTarget === "retail"}
                        onChange={() => setRepairTarget("retail")}
                      />
                      {t("wms.damagedService.repairTargetRetail")}
                    </label>
                  </fieldset>
                  {repairTarget === "retail" ? (
                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">
                        {t("wms.damagedService.retailWarehouse")}
                      </span>
                      {retailOptions.length === 0 ? (
                        <p className="text-xs text-amber-700">
                          {t("wms.damagedService.retailEmpty")}
                        </p>
                      ) : (
                        <select
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          value={targetWarehouseId}
                          onChange={(e) => setTargetWarehouseId(e.target.value)}
                        >
                          <option value="">{t("wms.damagedService.retailSelect")}</option>
                          {retailOptions.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.code} — {w.name}
                              {w.storeName ? ` (${w.storeName})` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  ) : null}
                </>
              ) : modal.action === "write_off" ? (
                <>
                  <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <Trash2 className="h-5 w-5 text-rose-600" />
                    {t("wms.damagedService.writeOffTitle")}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {t("wms.damagedService.writeOffDesc")}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
                    {t("wms.damagedService.reassignTitle")}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {t("wms.damagedService.reassignDesc")}
                  </p>
                  <label className="mt-4 block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">
                      {t("wms.damagedService.reassignTarget")}
                    </span>
                    <select
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={reassignToWarehouseId}
                      onChange={(e) => setReassignToWarehouseId(e.target.value)}
                    >
                      <option value="">{t("wms.damagedService.reassignSelect")}</option>
                      {reassignTargets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} — {w.name} ({companyName(w.companyId)})
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <label className="mt-4 block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  {modal.action === "reassign"
                    ? t("wms.damagedService.noteReassign")
                    : modal.action === "write_off"
                      ? t("wms.damagedService.noteWriteOff")
                      : t("wms.damagedService.noteOptional")}
                </span>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder={
                    modal.action === "write_off"
                      ? t("wms.damagedService.phWriteOff")
                      : modal.action === "reassign"
                        ? t("wms.damagedService.phReassign")
                        : t("wms.damagedService.phRepair")
                  }
                />
              </label>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  {t("wms.damagedService.cancel")}
                </button>
                <button
                  type="button"
                  disabled={
                    processing ||
                    (modal.action === "write_off" && note.trim().length < 5) ||
                    (modal.action === "reassign" && (note.trim().length < 5 || !reassignToWarehouseId)) ||
                    (modal.action === "repair" &&
                      repairTarget === "retail" &&
                      (!targetWarehouseId || retailOptions.length === 0))
                  }
                  onClick={() => void submitModal()}
                  className={
                    "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 " +
                    (modal.action === "write_off"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : modal.action === "reassign"
                        ? "bg-indigo-600 hover:bg-indigo-700"
                        : "bg-emerald-600 hover:bg-emerald-700")
                  }
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("wms.damagedService.confirm")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </InventoryShell>
    </InventoryGate>
  );
}
