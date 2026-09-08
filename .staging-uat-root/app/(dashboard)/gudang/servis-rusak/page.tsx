"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  Trash2,
  Wrench,
} from "lucide-react";
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
    companies.find((c) => c.id === id)?.company_name ?? "Entitas";

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
      setError("Qty proses harus lebih dari 0.");
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
      setError("Qty proses harus lebih dari 0.");
      return;
    }
    setNote("");
    setModal({ action: "write_off", rowKeys: keys });
  };

  const openReassignModal = (keys: string[]) => {
    if (!isSupervisor) return;
    const groups = buildLineGroups(keys);
    if (groups.length === 0) {
      setError("Qty proses harus lebih dari 0.");
      return;
    }
    if (groups.length > 1) {
      setError("Koreksi entitas: pilih baris dari satu gudang rusak saja.");
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
          throw new Error("Koreksi entitas: pilih baris dari satu gudang rusak saja.");
        }
        if (!reassignToWarehouseId) {
          throw new Error("Pilih gudang rusak tujuan.");
        }
        if (note.trim().length < 5) {
          throw new Error("Alasan koreksi wajib diisi (min. 5 karakter).");
        }
        await postDamagedReassign({
          fromDamagedWarehouseId: modal.fromWarehouseId,
          toDamagedWarehouseId: reassignToWarehouseId,
          lines: groups[0].lines,
          note: note.trim(),
        });
        setToast("Koreksi entitas berhasil — stok dipindah antar gudang rusak.");
        setTimeout(() => setToast(""), 3500);
        setModal(null);
        await load();
        return;
      }

      const groups = buildLineGroups(modal.rowKeys);
      if (groups.length === 0) {
        throw new Error("Qty proses harus lebih dari 0.");
      }

      if (modal.action === "repair" && repairTarget === "retail" && !targetWarehouseId) {
        throw new Error("Pilih gudang penjualan retail tujuan.");
      }

      if (modal.action === "write_off" && note.trim().length < 5) {
        throw new Error("Catatan teknisi wajib untuk pembuangan (min. 5 karakter).");
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
            ? "Berhasil dipindah ke gudang penjualan retail."
            : "Berhasil dipindah ke gudang entitas.",
        );
        if (lastAccounting?.kind === "reversal") {
          setExpenseDraft(lastAccounting);
        }
      } else {
        setToast("Berhasil dibuang dari sistem.");
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
      <InventoryShell title="Servis Gudang Rusak">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="mb-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <AlertTriangle className="h-6 w-6 text-rose-600" />
              Servis Gudang Rusak
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Antrian barang di <strong>gudang rusak</strong> (karantina per entitas). Teknisi
              menyatakan <strong>perbaikan berhasil</strong> → stok kembali ke gudang entitas atau
              retail, atau <strong>tidak bisa diperbaiki</strong> → keluar total dari sistem. Stok
              di sini tidak dihitung untuk penjualan/bundling. Masuk karantina otomatis membuat draft
              write-down (WD-*); perbaikan membuat draft pemulihan (REV-*).
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Sortir dari gudang sementara:{" "}
              <Link href="/gudang/sortir" className="font-medium text-indigo-600 hover:underline">
                Sortir & Disposisi
              </Link>
              {" · "}
              Buat gudang rusak:{" "}
              <Link href="/gudang/daftar" className="font-medium text-indigo-600 hover:underline">
                Daftar Gudang
              </Link>
            </p>
          </div>

          {!canPost ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Mode lihat saja — hanya supervisor/admin yang boleh posting perbaikan atau pembuangan.
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
                  {expenseDraft.kind === "reversal" ? "pemulihan nilai" : "biaya"}{" "}
                  <Link
                    href="/bisnis/biaya"
                    className="font-semibold text-emerald-900 underline hover:no-underline"
                  >
                    {expenseDraft.expenseNo}
                  </Link>{" "}
                  ({fmtIdr(Math.abs(expenseDraft.total))}
                  {expenseDraft.kind === "reversal" ? ", offset write-down" : ""}) — approve di
                  modul Pengeluaran.
                  {expenseDraft.kind === "write_off" ? (
                    <span className="block text-xs text-emerald-700/90">
                      Jika sudah ada write-down saat masuk karantina (WD-*), batalkan salah satu
                      agar tidak dobel posting.
                    </span>
                  ) : null}
                </span>
              ) : writeOffHint ? (
                <span className="mt-1 block text-xs text-emerald-700/90">
                  Kerugian mungkin sudah tercatat saat masuk karantina (draft WD-* di Pengeluaran).
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block min-w-[180px] flex-1 text-sm">
              <span className="mb-1 block font-medium text-slate-700">Entitas</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setWarehouseId("");
                }}
              >
                <option value="">Semua entitas</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-[200px] flex-1 text-sm">
              <span className="mb-1 block font-medium text-slate-700">Gudang rusak</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="">Semua gudang rusak</option>
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
                Pilih semua
              </button>
              <button
                type="button"
                disabled={bulkRowKeys.length === 0 || processing}
                onClick={() => openRepairModal(bulkRowKeys)}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Wrench className="h-3.5 w-3.5" />
                Perbaiki terpilih
              </button>
              <button
                type="button"
                disabled={bulkRowKeys.length === 0 || processing}
                onClick={() => openWriteOffModal(bulkRowKeys)}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Buang terpilih
              </button>
              {isSupervisor ? (
                <button
                  type="button"
                  disabled={bulkRowKeys.length === 0 || processing}
                  onClick={() => openReassignModal(bulkRowKeys)}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Koreksi entitas
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
              Belum ada gudang rusak aktif. Buat satu per entitas di{" "}
              <Link href="/gudang/daftar" className="font-semibold underline">
                Daftar Gudang
              </Link>
              .
            </p>
          ) : visibleItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              Tidak ada stok di gudang rusak untuk filter ini.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {canPost ? <th className="w-10 px-3 py-3" /> : null}
                    <th className="px-3 py-3">Produk</th>
                    <th className="px-3 py-3">Gudang</th>
                    <th className="px-3 py-3">Jejak masuk</th>
                    <th className="px-3 py-3 text-right">Stok</th>
                    <th className="px-3 py-3 text-right">Qty proses</th>
                    {canPost ? <th className="px-3 py-3 text-right">Aksi</th> : null}
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
                                title="Perbaiki"
                                onClick={() => openRepairModal([key])}
                                className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                              >
                                <Wrench className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                title="Buang"
                                onClick={() => openWriteOffModal([key])}
                                className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              {isSupervisor ? (
                                <button
                                  type="button"
                                  title="Koreksi entitas"
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
                    Konfirmasi perbaikan
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Stok dipindah dari gudang rusak ke tujuan yang dipilih.
                  </p>
                  <fieldset className="mt-4 space-y-2">
                    <legend className="text-sm font-medium text-slate-700">Tujuan perbaikan</legend>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="repairTarget"
                        checked={repairTarget === "entity"}
                        onChange={() => setRepairTarget("entity")}
                      />
                      Gudang entitas (siap dialokasi/transfer)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="repairTarget"
                        checked={repairTarget === "retail"}
                        onChange={() => setRepairTarget("retail")}
                      />
                      Gudang penjualan retail (siap jual)
                    </label>
                  </fieldset>
                  {repairTarget === "retail" ? (
                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">
                        Gudang retail *
                      </span>
                      {retailOptions.length === 0 ? (
                        <p className="text-xs text-amber-700">
                          Belum ada gudang retail aktif untuk entitas ini.
                        </p>
                      ) : (
                        <select
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          value={targetWarehouseId}
                          onChange={(e) => setTargetWarehouseId(e.target.value)}
                        >
                          <option value="">Pilih gudang retail</option>
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
                    Konfirmasi pembuangan
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Stok keluar total dari sistem. Catatan teknisi wajib diisi. Draft biaya
                    kerugian persediaan dibuat otomatis jika harga modal tersedia.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
                    Koreksi entitas gudang rusak
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Pindahkan stok ke gudang rusak entitas yang benar (supervisor). Hanya antar
                    gudang rusak.
                  </p>
                  <label className="mt-4 block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">
                      Gudang rusak tujuan *
                    </span>
                    <select
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={reassignToWarehouseId}
                      onChange={(e) => setReassignToWarehouseId(e.target.value)}
                    >
                      <option value="">Pilih gudang rusak tujuan</option>
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
                    ? "Alasan koreksi *"
                    : `Catatan teknisi${modal.action === "write_off" ? " *" : " (opsional)"}`}
                </span>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder={
                    modal.action === "write_off"
                      ? "Contoh: PCB mati total, tidak layak servis"
                      : modal.action === "reassign"
                        ? "Contoh: Salah entitas saat QC, seharusnya PT B"
                        : "Contoh: Ganti flex cable, sudah normal"
                  }
                />
              </label>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Batal
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
                  {modal.action === "write_off"
                    ? "Buang dari sistem"
                    : modal.action === "reassign"
                      ? "Pindah gudang rusak"
                      : repairTarget === "retail"
                        ? "Pindah ke retail"
                        : "Pindah ke entitas"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </InventoryShell>
    </InventoryGate>
  );
}
