"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Printer, ShieldCheck, Warehouse } from "lucide-react";
import { updatePurchaseOrder } from "@/lib/bisnis/client";
import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/bisnis/types";
import { printProductBarcodeLabels } from "@/lib/inventory/print-product-barcode";
import {
  countWorkflowProgress,
  mergeWorkflowWithLines,
  parseReceivingWorkflow,
  serializeReceivingWorkflow,
  type ReceivingWorkflow,
} from "@/lib/wms/receiving-workflow";
import { WmsBadge, WmsCard, WmsSectionTitle } from "@/components/wms/ui";
import { getErrorMessage } from "@/lib/errors";

const fmtNum = (v: number) => new Intl.NumberFormat("id-ID").format(v);

type Props = {
  po: PurchaseOrder;
  lines: PurchaseOrderLine[];
  disabled?: boolean;
  onWorkflowChange?: (wf: ReceivingWorkflow) => void;
};

export function ReceivingWorkflowPanel({
  po,
  lines,
  disabled,
  onWorkflowChange,
}: Props) {
  const [workflow, setWorkflow] = useState<ReceivingWorkflow>({ lines: {} });
  const [saving, setSaving] = useState(false);

  const warehouseLabel = po.expand?.warehouse
    ? `${po.expand.warehouse.code} — ${po.expand.warehouse.name}`
    : "Gudang tujuan PO";

  useEffect(() => {
    const qtyMap = Object.fromEntries(lines.map((l) => [l.id, l.qty]));
    const parsed = parseReceivingWorkflow(po.receiving_workflow_json);
    const merged = mergeWorkflowWithLines(parsed, lines.map((l) => l.id), qtyMap);
    setWorkflow(merged);
    onWorkflowChange?.(merged);
  }, [po.receiving_workflow_json, lines]);

  const persist = useCallback(
    async (next: ReceivingWorkflow) => {
      setSaving(true);
      try {
        await updatePurchaseOrder(po.id, {
          receiving_workflow_json: serializeReceivingWorkflow(next),
        });
        setWorkflow(next);
        onWorkflowChange?.(next);
      } catch (e: unknown) {
        alert(getErrorMessage(e, "Gagal menyimpan progres QC/label"));
      } finally {
        setSaving(false);
      }
    },
    [po.id, onWorkflowChange],
  );

  const patchLine = (lineId: string, patch: Partial<ReceivingWorkflow["lines"][string]>) => {
    const next: ReceivingWorkflow = {
      lines: {
        ...workflow.lines,
        [lineId]: { ...workflow.lines[lineId], ...patch },
      },
    };
    void persist(next);
  };

  const progress = countWorkflowProgress(
    lines.map((l) => l.id),
    workflow,
  );

  if (lines.length === 0) return null;

  return (
    <WmsCard className="border-emerald-200 bg-emerald-50/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <WmsSectionTitle
          title="QC & Label"
          subtitle="Stok masuk gudang sementara dulu — setelah Komplit, qty lulus QC pindah ke gudang entitas; qty rusak ke gudang rusak."
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <WmsBadge tone={progress.qc === progress.total ? "emerald" : "slate"}>
            QC {progress.qc}/{progress.total}
          </WmsBadge>
          <WmsBadge tone={progress.label === progress.total ? "emerald" : "slate"}>
            Label {progress.label}/{progress.total}
          </WmsBadge>
          {saving && (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Menyimpan…
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 flex items-center gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm text-indigo-900">
        <Warehouse className="h-4 w-4 shrink-0" />
        <span>
          Alur: <strong>Gudang Sementara</strong> → QC → gudang entitas / rusak · Entitas:{" "}
          <strong>{warehouseLabel}</strong>
        </span>
      </p>

      <div className="mt-4 space-y-4">
        {lines.map((line) => {
          const st = workflow.lines[line.id];
          const product = line.expand?.product;
          const sku = product?.sku ?? "—";
          const barcode = (product as { barcode?: string } | undefined)?.barcode?.trim() || sku;
          const name = product?.name ?? "—";
          const labelQty = st?.label_print_qty ?? line.qty;

          return (
            <div
              key={line.id}
              className="rounded-xl border border-white/80 bg-white p-4 shadow-sm ring-1 ring-slate-200/80"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <p className="font-semibold text-slate-900">{name}</p>
                  <p className="font-mono text-xs text-slate-500">
                    SKU {sku} · Qty PO {fmtNum(line.qty)}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={disabled || saving}
                    checked={!!st?.qc_ok}
                    onChange={(e) => patchLine(line.id, { qc_ok: e.target.checked })}
                  />
                  <span className="text-sm">
                    <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      QC lulus <span className="text-red-500">*</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Barang sesuai PO & surat jalan — wajib sebelum Komplit
                    </span>
                    <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      Qty rusak
                      <input
                        type="number"
                        min={0}
                        max={line.qty}
                        disabled={disabled || saving}
                        value={st?.damaged_qty ?? 0}
                        onChange={(e) =>
                          patchLine(line.id, {
                            damaged_qty: Math.min(
                              line.qty,
                              Math.max(0, Number(e.target.value) || 0),
                            ),
                          })
                        }
                        className="w-16 rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                      <span className="text-slate-400">/ {fmtNum(line.qty)}</span>
                    </label>
                  </span>
                </label>

                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="flex items-center gap-1 text-sm font-medium text-slate-800">
                    <Printer className="h-4 w-4 text-emerald-600" />
                    Cetak label barcode <span className="font-normal text-slate-400">(opsional)</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="text-xs text-slate-600">
                      Jumlah stiker
                      <input
                        type="number"
                        min={1}
                        max={500}
                        disabled={disabled || saving}
                        value={labelQty}
                        onChange={(e) =>
                          patchLine(line.id, {
                            label_print_qty: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="ml-1 w-16 rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        printProductBarcodeLabels({
                          sku,
                          barcode,
                          productName: name,
                          poNo: po.po_no,
                          copies: labelQty,
                        });
                        patchLine(line.id, { label_printed: true, label_print_qty: labelQty });
                      }}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Cetak ke printer
                    </button>
                  </div>
                  {st?.label_printed ? (
                    <p className="mt-1 text-xs text-emerald-700">Sudah dicetak</p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </WmsCard>
  );
}
