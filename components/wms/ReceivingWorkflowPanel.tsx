"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MapPinned,
  Printer,
  ShieldCheck,
} from "lucide-react";
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
import { fetchWarehouseRooms } from "@/lib/inventory/client";
import type { InvLocation } from "@/lib/inventory/types";
import {
  resolveReceivingPutaway,
  type ReceivingPutawayHint,
} from "@/lib/wms/putaway-suggest";
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
  const [putawayMap, setPutawayMap] = useState<Record<string, ReceivingPutawayHint>>({});
  const [rooms, setRooms] = useState<InvLocation[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadPutaway, setLoadPutaway] = useState(true);

  const warehouseId = po.warehouse;

  useEffect(() => {
    const qtyMap = Object.fromEntries(lines.map((l) => [l.id, l.qty]));
    const parsed = parseReceivingWorkflow(po.receiving_workflow_json);
    const merged = mergeWorkflowWithLines(parsed, lines.map((l) => l.id), qtyMap);
    setWorkflow(merged);
    onWorkflowChange?.(merged);
  }, [po.receiving_workflow_json, lines]);

  useEffect(() => {
    if (!warehouseId || lines.length === 0) {
      setPutawayMap({});
      setLoadPutaway(false);
      return;
    }
    let cancelled = false;
    setLoadPutaway(true);
    void Promise.all(
      lines.map(async (l) => {
        const hint = await resolveReceivingPutaway(warehouseId, l.product);
        return [l.id, hint] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setPutawayMap(Object.fromEntries(entries));
      setLoadPutaway(false);
    });
    return () => {
      cancelled = true;
    };
  }, [warehouseId, lines]);

  useEffect(() => {
    if (!warehouseId) {
      setRooms([]);
      return;
    }
    void fetchWarehouseRooms(warehouseId)
      .then(setRooms)
      .catch(() => setRooms([]));
  }, [warehouseId]);

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
        alert(getErrorMessage(e, "Gagal menyimpan progres QC/label/putaway"));
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
          title="QC → Label → Putaway"
          subtitle="Putaway: produk dengan master → lokasi otomatis; belum ada penempatan → NEW (atur gudang/ruangan dulu)."
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <WmsBadge tone={progress.qc === progress.total ? "emerald" : "slate"}>
            QC {progress.qc}/{progress.total}
          </WmsBadge>
          <WmsBadge tone={progress.label === progress.total ? "emerald" : "slate"}>
            Label {progress.label}/{progress.total}
          </WmsBadge>
          <WmsBadge tone={progress.putaway === progress.total ? "emerald" : "slate"}>
            Putaway {progress.putaway}/{progress.total}
          </WmsBadge>
          {saving && (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Menyimpan…
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {lines.map((line) => {
          const st = workflow.lines[line.id];
          const product = line.expand?.product;
          const sku = product?.sku ?? "—";
          const barcode = product?.barcode?.trim() || sku;
          const name = product?.name ?? "—";
          const hint = putawayMap[line.id];
          const isNew = hint?.status === "new";
          const dest = hint?.status === "known" ? hint.destination : null;
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

              <div className="mt-3 grid gap-4 lg:grid-cols-3">
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
                      QC lulus
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Barang sesuai PO & surat jalan
                    </span>
                  </span>
                </label>

                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="flex items-center gap-1 text-sm font-medium text-slate-800">
                    <Printer className="h-4 w-4 text-emerald-600" />
                    Cetak label barcode
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
                  {st?.label_printed && (
                    <p className="mt-1 text-xs text-emerald-700">Sudah dicetak</p>
                  )}
                </div>

                <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                  <p className="flex items-center gap-1 text-sm font-medium text-indigo-900">
                    <MapPinned className="h-4 w-4" />
                    Susun ke ruangan
                  </p>
                  {loadPutaway ? (
                    <p className="mt-2 text-xs text-slate-500">Memuat…</p>
                  ) : isNew ? (
                    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                      <p className="font-mono text-sm font-bold tracking-wide text-amber-900">NEW</p>
                      <p className="mt-1 text-xs text-amber-900">
                        Produk belum punya penempatan di gudang ini. Lakukan proses awal: tentukan{" "}
                        <strong>gudang & ruangan</strong> di{" "}
                        <Link href="/gudang/daftar" className="font-semibold underline">
                          Daftar Gudang
                        </Link>
                        , lalu set produk di{" "}
                        <Link href="/gudang/produk" className="font-semibold underline">
                          Daftar Produk
                        </Link>{" "}
                        atau{" "}
                        <Link href="/gudang/lokasi" className="font-semibold underline">
                          Lokasi Ruangan
                        </Link>
                        . Setelah itu muat ulang halaman penerimaan.
                      </p>
                    </div>
                  ) : dest ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-emerald-800">
                        Dari data master:{" "}
                        <span className="font-semibold text-indigo-900">{dest.summary}</span>
                      </p>
                      <p className="rounded border border-indigo-200 bg-white px-2 py-1.5 font-mono text-xs text-indigo-800">
                        Taruh di: {dest.locationCode}
                        {dest.locationName !== dest.locationCode ? ` (${dest.locationName})` : ""}
                      </p>
                    </div>
                  ) : rooms.length === 0 ? (
                    <p className="mt-2 text-xs text-amber-800">
                      Belum ada ruangan di gudang ini.{" "}
                      <Link href="/gudang/daftar" className="font-semibold underline">
                        Buat gudang & ruangan
                      </Link>
                      .
                    </p>
                  ) : null}
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={disabled || saving || isNew || !dest?.locationId}
                      checked={!!st?.putaway_done}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          patchLine(line.id, {
                            putaway_done: false,
                            putaway_location_id: undefined,
                          });
                          return;
                        }
                        const locId = dest?.locationId;
                        if (!locId) return;
                        const room = rooms.find((r) => r.id === locId);
                        patchLine(line.id, {
                          putaway_done: true,
                          putaway_location_id: locId,
                          putaway_rack_code: room?.code ?? dest.locationCode,
                        });
                      }}
                    />
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {isNew
                        ? "Putaway setelah penempatan diatur"
                        : "Sudah ditaruh di ruangan master"}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </WmsCard>
  );
}
