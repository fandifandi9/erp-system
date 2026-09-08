"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Video,
} from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { WmsCard } from "@/components/wms/ui";
import {
  fetchRetur,
  fetchReturLines,
  fetchSalesOrder,
  fetchInvoice,
  confirmSalesReturnWmsReceiveApi,
} from "@/lib/bisnis/client";
import type { Retur, ReturLine, ReturLineCondition, SalesOrder, Invoice } from "@/lib/bisnis/types";
import { EXPECTED_CONDITION_LABEL } from "@/lib/bisnis/sales-retur-expected";
import { analyzeSalesReturWmsReceive } from "@/lib/core/expected-actual";
import { parseUnboxingMedia } from "@/lib/wms/unboxing-media";

type ConditionChoice = "match" | "mismatch";

function lineExpectedCondition(line: ReturLine): ReturLineCondition {
  return line.expected_condition === "damaged" || line.condition === "damaged" ? "damaged" : "good";
}

function actualConditionFromChoice(
  expected: ReturLineCondition,
  choice: ConditionChoice,
): ReturLineCondition {
  if (choice === "match") return expected;
  return expected === "good" ? "damaged" : "good";
}

export default function GudangPenerimaanReturPage() {
  const { id } = useParams<{ id: string }>();
  const [retur, setRetur] = useState<Retur | null>(null);
  const [lines, setLines] = useState<ReturLine[]>([]);
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [wmsNote, setWmsNote] = useState("");
  const [receivedQty, setReceivedQty] = useState<Record<string, number>>({});
  const [conditionChoice, setConditionChoice] = useState<Record<string, ConditionChoice>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetchRetur(id);
      setRetur(r);
      const ls = await fetchReturLines(id);
      setLines(ls);
      const qtyMap: Record<string, number> = {};
      const choiceMap: Record<string, ConditionChoice> = {};
      for (const l of ls) {
        qtyMap[l.id] = l.actual_qty ?? l.qty;
        choiceMap[l.id] =
          l.actual_condition && l.actual_condition !== lineExpectedCondition(l) ? "mismatch" : "match";
      }
      setReceivedQty(qtyMap);
      setConditionChoice(choiceMap);

      const soId = r.sales_order || r.reference_id;
      if (soId && r.type === "penjualan") {
        try {
          setSo(await fetchSalesOrder(soId));
        } catch {
          setSo(null);
        }
      } else {
        setSo(null);
      }
      if (r.invoice && r.type === "penjualan") {
        try {
          setInvoice(await fetchInvoice(r.invoice));
        } catch {
          setInvoice(null);
        }
      } else {
        setInvoice(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat retur");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isPenjualan = retur?.type === "penjualan";
  const awaitingWms =
    retur?.workflow_phase === "awaiting_wms" ||
    (!retur?.workflow_phase && retur?.status === "draft");
  const wmsDone = retur?.wms_receive_status === "complete";

  const validation = useMemo(() => {
    if (!isPenjualan || !lines.length) return null;
    const actuals = lines.map((l) => ({
      lineId: l.id,
      actualQty: receivedQty[l.id] ?? l.qty,
      actualCondition: actualConditionFromChoice(
        lineExpectedCondition(l),
        conditionChoice[l.id] ?? "match",
      ),
    }));
    return analyzeSalesReturWmsReceive(lines, actuals);
  }, [lines, receivedQty, conditionChoice, isPenjualan]);

  const handleConfirm = async () => {
    if (!retur) return;
    setConfirming(true);
    setError("");
    try {
      let unboxingPath: string | undefined;

      if (videoFile || photoFiles.length > 0) {
        const form = new FormData();
        if (videoFile) form.append("video", videoFile);
        for (const photo of photoFiles) form.append("photos", photo);
        form.append("entity_kind", retur.type === "penjualan" ? "sales_return" : "purchase_return");
        form.append("entity_id", retur.id);
        const mediaRes = await fetch("/api/wms/unboxing-video", { method: "POST", body: form });
        const mediaJson = (await mediaRes.json()) as { path?: string; error?: string };
        if (!mediaRes.ok) throw new Error(mediaJson.error || "Gagal menyimpan bukti");
        unboxingPath = mediaJson.path || undefined;
      }

      await confirmSalesReturnWmsReceiveApi(retur.id, {
        unboxing_video_path: unboxingPath,
        wms_note: wmsNote.trim() || undefined,
        received_lines: lines.map((l) => {
          const expected = lineExpectedCondition(l);
          const choice = conditionChoice[l.id] ?? "match";
          return {
            line_id: l.id,
            product: l.product,
            qty: receivedQty[l.id] ?? l.qty,
            condition: actualConditionFromChoice(expected, choice),
          };
        }),
      });
      setVideoFile(null);
      setPhotoFiles([]);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal konfirmasi");
    } finally {
      setConfirming(false);
    }
  };

  const savedMedia = parseUnboxingMedia(retur?.unboxing_video_path);
  const customerName =
    retur?.expand?.customer?.name ?? invoice?.expand?.customer?.name ?? so?.expand?.customer?.name ?? "—";
  const invoiceNo = invoice?.invoice_no ?? "—";

  return (
    <InventoryGate>
      <InventoryShell
        title="Penerimaan Retur Penjualan"
        subtitle=""
        module="wms"
      >
        <Link href="/gudang/penerimaan" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Antrean penerimaan
        </Link>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : !retur ? (
          <p className="text-slate-500">Retur tidak ditemukan.</p>
        ) : !isPenjualan ? (
          <WmsCard padding="p-5">
            <p className="text-sm text-slate-600">Retur pembelian — gunakan alur persiapan kirim supplier.</p>
          </WmsCard>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {/* HEADER */}
            <WmsCard padding="p-5">
              <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Nomor Retur</dt>
                  <dd className="mt-0.5 font-mono text-base font-bold text-slate-900">{retur.retur_no}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoice</dt>
                  <dd className="mt-0.5 font-mono text-base font-semibold text-slate-800">{invoiceNo}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer</dt>
                  <dd className="mt-0.5 text-base font-medium text-slate-800">{customerName}</dd>
                </div>
              </dl>
              {wmsDone ? (
                <p className="mt-3 text-xs font-medium text-emerald-700">Penerimaan WMS selesai</p>
              ) : null}
            </WmsCard>

            {/* ESTIMASI BISNIS */}
            <WmsCard padding="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Estimasi Bisnis</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="pb-2 font-medium">Produk</th>
                    <th className="pb-2 text-right font-medium">Qty Estimasi</th>
                    <th className="pb-2 font-medium">Kondisi Estimasi</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 text-slate-800">
                        {line.expand?.product?.name ?? line.product}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">{line.qty}</td>
                      <td className="py-2.5 text-slate-700">
                        {EXPECTED_CONDITION_LABEL[lineExpectedCondition(line)]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </WmsCard>

            {/* PEMERIKSAAN WMS */}
            {awaitingWms ? (
              <>
                <WmsCard padding="p-5">
                  <h2 className="mb-3 text-sm font-semibold text-slate-800">Pemeriksaan WMS</h2>
                  <div className="space-y-4">
                    {lines.map((line) => (
                      <div
                        key={line.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-3"
                      >
                        <p className="mb-2 text-sm font-medium text-slate-800">
                          {line.expand?.product?.name ?? line.product}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-sm">
                            <span className="text-xs text-slate-500">Qty diterima</span>
                            <input
                              type="number"
                              min={0}
                              max={line.qty}
                              value={receivedQty[line.id] ?? line.qty}
                              disabled={confirming}
                              onChange={(e) =>
                                setReceivedQty((m) => ({
                                  ...m,
                                  [line.id]: Number(e.target.value) || 0,
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
                            />
                          </label>
                          <fieldset className="text-sm">
                            <legend className="text-xs text-slate-500">Kondisi fisik</legend>
                            <div className="mt-1 flex flex-col gap-1.5">
                              <label className="flex cursor-pointer items-center gap-2">
                                <input
                                  type="radio"
                                  name={`cond-${line.id}`}
                                  checked={(conditionChoice[line.id] ?? "match") === "match"}
                                  disabled={confirming}
                                  onChange={() =>
                                    setConditionChoice((m) => ({ ...m, [line.id]: "match" }))
                                  }
                                />
                                <span>Sesuai Estimasi</span>
                              </label>
                              <label className="flex cursor-pointer items-center gap-2">
                                <input
                                  type="radio"
                                  name={`cond-${line.id}`}
                                  checked={conditionChoice[line.id] === "mismatch"}
                                  disabled={confirming}
                                  onChange={() =>
                                    setConditionChoice((m) => ({ ...m, [line.id]: "mismatch" }))
                                  }
                                />
                                <span>Tidak Sesuai Estimasi</span>
                              </label>
                            </div>
                          </fieldset>
                        </div>
                      </div>
                    ))}

                    <label className="block text-sm">
                      <span className="text-xs text-slate-500">Catatan WMS</span>
                      <input
                        type="text"
                        value={wmsNote}
                        disabled={confirming}
                        onChange={(e) => setWmsNote(e.target.value)}
                        placeholder="Opsional"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                          <Camera className="h-3.5 w-3.5" /> Upload Foto
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={confirming}
                          onChange={(e) => setPhotoFiles([...(e.target.files ?? [])])}
                          className="text-xs"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                          <Video className="h-3.5 w-3.5" /> Upload Video
                        </span>
                        <input
                          type="file"
                          accept="video/*"
                          disabled={confirming}
                          onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                          className="text-xs"
                        />
                      </label>
                    </div>
                  </div>
                </WmsCard>

                {/* VALIDASI */}
                {validation ? (
                  <div
                    className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${
                      validation.match
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    {validation.match ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        Sesuai Estimasi Bisnis
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Perlu Klarifikasi Bisnis
                      </>
                    )}
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={confirming}
                  onClick={() => void handleConfirm()}
                  className="w-full rounded-lg bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {confirming ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Memproses…
                    </span>
                  ) : (
                    "Konfirmasi Penerimaan"
                  )}
                </button>
              </>
            ) : wmsDone ? (
              <WmsCard padding="p-5">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">Hasil Pemeriksaan</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="pb-2 font-medium">Produk</th>
                      <th className="pb-2 text-right font-medium">Qty diterima</th>
                      <th className="pb-2 font-medium">Kondisi fisik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} className="border-b border-slate-50">
                        <td className="py-2.5">{line.expand?.product?.name ?? line.product}</td>
                        <td className="py-2.5 text-right tabular-nums">{line.actual_qty ?? line.qty}</td>
                        <td className="py-2.5">
                          {EXPECTED_CONDITION_LABEL[line.actual_condition ?? line.condition ?? "good"]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {savedMedia.video || (savedMedia.photos?.length ?? 0) > 0 ? (
                  <p className="mt-3 text-xs text-slate-500">Bukti unboxing tersimpan.</p>
                ) : null}
              </WmsCard>
            ) : null}
          </div>
        )}
      </InventoryShell>
    </InventoryGate>
  );
}
