"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { createSalesReturFromOrderApi, fetchSalesOrderLines } from "@/lib/bisnis/client";
import {
  emptySettlementEstimate,
  EXPECTED_CONDITION_LABEL,
  isSettlementIncomingType,
  isSettlementOutgoingType,
  SETTLEMENT_INCOMING_LABELS,
  SETTLEMENT_OUTGOING_LABELS,
  type CreateSalesReturLineInput,
  type SalesReturSettlementEstimate,
  type SettlementIncomingType,
  type SettlementOutgoingType,
} from "@/lib/bisnis/sales-retur-expected";
import { BISNIS_COLLECTIONS, type ReturLineCondition, type SalesOrder, type SalesOrderLine } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";

type LineDraft = {
  sales_order_line: string;
  productName: string;
  sku: string;
  maxQty: number;
  qty: number;
  included: boolean;
  expected_condition: ReturLineCondition;
  reason: string;
};

type SettlementDraft = {
  key: string;
  kind: "outgoing" | "incoming";
  type: SettlementOutgoingType | SettlementIncomingType;
  amount: number;
};

type Props = {
  open: boolean;
  salesOrder: SalesOrder;
  onClose: () => void;
  onCreated: (returId: string) => void;
};

const fmtNum = (v: number) => new Intl.NumberFormat("id-ID").format(v);
const OUTGOING_TYPES = Object.keys(SETTLEMENT_OUTGOING_LABELS) as SettlementOutgoingType[];
const INCOMING_TYPES = Object.keys(SETTLEMENT_INCOMING_LABELS) as SettlementIncomingType[];

let settlementKeySeq = 0;
function nextSettlementKey() {
  settlementKeySeq += 1;
  return `st-${settlementKeySeq}`;
}

async function loadRemainingBySoLine(salesOrderId: string, soLines: SalesOrderLine[]) {
  const remaining: Record<string, number> = {};
  for (const sol of soLines) {
    const returLines = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<{
      qty: number;
      expand?: { retur?: { status?: string } };
    }>({
      filter: `sales_order_line = "${sol.id}"`,
      expand: "retur",
      requestKey: null,
    });
    const used = returLines
      .filter((l) => l.expand?.retur?.status === "completed")
      .reduce((s, l) => s + (Number(l.qty) || 0), 0);
    remaining[sol.id] = Math.max(0, (Number(sol.qty) || 0) - used);
  }
  return remaining;
}

function toSettlementEstimate(drafts: SettlementDraft[]): SalesReturSettlementEstimate {
  return {
    items: drafts
      .filter((d) => d.amount > 0)
      .map((d) => ({ type: d.type, amount: d.amount })),
  };
}

export function SalesReturCreateModal({ open, salesOrder, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [settlementDrafts, setSettlementDrafts] = useState<SettlementDraft[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const soLines = await fetchSalesOrderLines(salesOrder.id);
      const remaining = await loadRemainingBySoLine(salesOrder.id, soLines);
      setLines(
        soLines
          .filter((sol) => (remaining[sol.id] ?? 0) > 0)
          .map((sol) => ({
            sales_order_line: sol.id,
            productName: sol.expand?.product?.name ?? sol.name_snapshot ?? "Produk",
            sku: sol.expand?.product?.sku ?? sol.sku_snapshot ?? "—",
            maxQty: remaining[sol.id] ?? 0,
            qty: remaining[sol.id] ?? 0,
            included: true,
            expected_condition: "good" as ReturLineCondition,
            reason: "",
          })),
      );
    } finally {
      setLoading(false);
    }
  }, [salesOrder]);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setNotes("");
    setSettlementDrafts([]);
    void load();
  }, [open, load]);

  const patchLine = (lineId: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.sales_order_line === lineId ? { ...l, ...patch } : l)));
  };

  const addSettlement = (kind: SettlementDraft["kind"]) => {
    setSettlementDrafts((prev) => [
      ...prev,
      {
        key: nextSettlementKey(),
        kind,
        type: kind === "outgoing" ? "refund_customer" : "recovery_marketplace",
        amount: 0,
      },
    ]);
  };

  const patchSettlement = (key: string, patch: Partial<SettlementDraft>) => {
    setSettlementDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const removeSettlement = (key: string) => {
    setSettlementDrafts((prev) => prev.filter((d) => d.key !== key));
  };

  const handleSubmit = async () => {
    const payloadLines: CreateSalesReturLineInput[] = lines
      .filter((l) => l.included && l.qty > 0)
      .map((l) => ({
        sales_order_line: l.sales_order_line,
        qty: l.qty,
        expected_condition: l.expected_condition,
        reason: l.reason.trim() || undefined,
      }));

    if (!payloadLines.length) {
      alert("Pilih minimal satu barang dengan qty retur.");
      return;
    }

    const settlement = toSettlementEstimate(settlementDrafts);

    setSubmitting(true);
    try {
      const { retur } = await createSalesReturFromOrderApi(salesOrder.id, {
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
        settlement_estimate: settlement.items.length > 0 ? settlement : undefined,
        lines: payloadLines,
      });
      onCreated(retur.id);
      onClose();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal membuat retur"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Buat Retur</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              SO {salesOrder.order_no} · Estimasi kondisi dari customer. Gudang tujuan ditentukan sistem.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Semua barang pada penjualan ini sudah diretur.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Alasan retur (customer)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Mis. tidak jadi digunakan"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Catatan internal</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Opsional"
                  />
                </label>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-3 py-2">✓</th>
                      <th className="px-3 py-2">Produk</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2">Kondisi diharapkan</th>
                      <th className="px-3 py-2">Catatan baris</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.sales_order_line} className="border-b border-slate-50">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={line.included}
                            onChange={(e) => patchLine(line.sales_order_line, { included: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-800">{line.productName}</p>
                          <p className="font-mono text-xs text-slate-500">{line.sku}</p>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={1}
                            max={line.maxQty}
                            disabled={!line.included}
                            value={line.qty}
                            onChange={(e) =>
                              patchLine(line.sales_order_line, {
                                qty: Math.min(line.maxQty, Math.max(1, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-sm"
                          />
                          <span className="ml-1 text-xs text-slate-400">/ {fmtNum(line.maxQty)}</span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            disabled={!line.included}
                            value={line.expected_condition}
                            onChange={(e) =>
                              patchLine(line.sales_order_line, {
                                expected_condition: e.target.value as ReturLineCondition,
                              })
                            }
                            className="w-full min-w-[11rem] rounded border border-slate-200 px-2 py-1 text-sm"
                          >
                            <option value="good">{EXPECTED_CONDITION_LABEL.good}</option>
                            <option value="damaged">{EXPECTED_CONDITION_LABEL.damaged}</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            disabled={!line.included}
                            value={line.reason}
                            onChange={(e) => patchLine(line.sales_order_line, { reason: e.target.value })}
                            className="w-full min-w-[8rem] rounded border border-slate-200 px-2 py-1 text-sm"
                            placeholder="Opsional"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Estimasi settlement (opsional)</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Default kosong. Tambah beban atau recovery hanya jika diperlukan.
                </p>

                {settlementDrafts.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {settlementDrafts.map((row) => {
                      const typeOptions =
                        row.kind === "outgoing" ? OUTGOING_TYPES : INCOMING_TYPES;
                      const labels =
                        row.kind === "outgoing" ? SETTLEMENT_OUTGOING_LABELS : SETTLEMENT_INCOMING_LABELS;
                      return (
                        <li
                          key={row.key}
                          className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <span className="text-xs font-semibold uppercase text-slate-500">
                            {row.kind === "outgoing" ? "Beban" : "Recovery"}
                          </span>
                          <select
                            value={row.type}
                            onChange={(e) => {
                              const t = e.target.value;
                              if (row.kind === "outgoing" && isSettlementOutgoingType(t as SettlementOutgoingType)) {
                                patchSettlement(row.key, { type: t as SettlementOutgoingType });
                              } else if (
                                row.kind === "incoming" &&
                                isSettlementIncomingType(t as SettlementIncomingType)
                              ) {
                                patchSettlement(row.key, { type: t as SettlementIncomingType });
                              }
                            }}
                            className="min-w-[10rem] flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm"
                          >
                            {typeOptions.map((t) => (
                              <option key={t} value={t}>
                                {labels[t as keyof typeof labels]}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            placeholder="Rp"
                            value={row.amount || ""}
                            onChange={(e) =>
                              patchSettlement(row.key, { amount: Number(e.target.value) || 0 })
                            }
                            className="w-32 rounded border border-slate-200 px-2 py-1.5 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeSettlement(row.key)}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                            title="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addSettlement("outgoing")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Beban
                  </button>
                  <button
                    type="button"
                    onClick={() => addSettlement("incoming")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Recovery
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={submitting || loading || lines.length === 0}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Buat retur & kirim ke WMS
          </button>
        </div>
      </div>
    </div>
  );
}
