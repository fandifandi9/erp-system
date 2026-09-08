"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, Loader2, Video, X } from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { WmsCard } from "@/components/wms/ui";
import {
  fetchRetur,
  fetchReturLines,
  fetchSalesOrder,
  fetchSalesOrderLines,
  fetchInvoice,
  confirmSalesReturnWmsReceiveApi,
  startSalesReturnWmsProcessApi,
} from "@/lib/bisnis/client";
import type { Retur, ReturLine, SalesOrder, Invoice } from "@/lib/bisnis/types";
import { getDamagedWarehouse, getTransitWarehouse } from "@/lib/bisnis/entity-modules";
import { parseUnboxingMedia, unboxingMediaApiUrl } from "@/lib/wms/unboxing-media";
import { parseSerialNumbersJson } from "@/lib/wms/serial-numbers";
import { fetchWarehouses } from "@/lib/inventory/client";
import type { InvWarehouse } from "@/lib/inventory/types";
import { useLocale } from "@/components/LocaleProvider";
import { returDisplayNo, returHasPlatformNo } from "@/lib/bisnis/retur-display";
import { isReturOnWmsHold } from "@/lib/bisnis/retur-workflow";
import { pb } from "@/lib/pocketbase";

type ClaimDecision = "agree" | "disagree";
type UiStep = "preview" | "receive";

function formatWarehouseLabel(wh?: Pick<InvWarehouse, "code" | "name"> | null): string {
  if (!wh) return "—";
  return `${wh.code} — ${wh.name}`;
}

/** actual_qty sering 0 di PB sebelum WMS isi — jangan pakai 0 sebagai qty diterima. */
function defaultReceivedQty(line: ReturLine): number {
  const actual = Number(line.actual_qty);
  if (Number.isFinite(actual) && actual > 0) return actual;
  return Math.max(0, Number(line.qty) || 0);
}

export default function GudangPenerimaanReturPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useLocale();
  const [retur, setRetur] = useState<Retur | null>(null);
  const [lines, setLines] = useState<ReturLine[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [serialBySoLine, setSerialBySoLine] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [wmsNote, setWmsNote] = useState("");
  const [disputeNote, setDisputeNote] = useState("");
  const [claimDecision, setClaimDecision] = useState<ClaimDecision | null>(null);
  const [uiStep, setUiStep] = useState<UiStep>("preview");
  const [showDestModal, setShowDestModal] = useState(false);
  const [receivedQty, setReceivedQty] = useState<Record<string, number>>({});
  const [destWarehouses, setDestWarehouses] = useState<{
    store: InvWarehouse | null;
    damaged: InvWarehouse | null;
    transit: InvWarehouse | null;
  }>({ store: null, damaged: null, transit: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetchRetur(id);
      setRetur(r);
      const [ls, wh] = await Promise.all([fetchReturLines(id), fetchWarehouses(true)]);
      setLines(ls);
      const qtyMap: Record<string, number> = {};
      for (const l of ls) {
        qtyMap[l.id] = defaultReceivedQty(l);
      }
      setReceivedQty(qtyMap);
      setWmsNote(typeof r.wms_note === "string" ? r.wms_note : "");
      setDisputeNote(typeof r.wms_dispute_note === "string" ? r.wms_dispute_note : "");
      if (r.wms_claim_decision === "agree" || r.wms_claim_decision === "disagree") {
        setClaimDecision(r.wms_claim_decision);
      }

      const soId = r.sales_order || r.reference_id;
      let soData: SalesOrder | null = null;
      if (soId && r.type === "penjualan") {
        try {
          soData = await fetchSalesOrder(soId);
          const soLines = await fetchSalesOrderLines(soId);
          const map: Record<string, string[]> = {};
          for (const sol of soLines) {
            map[sol.id] = parseSerialNumbersJson(sol.serial_numbers_json);
          }
          setSerialBySoLine(map);
        } catch {
          setSerialBySoLine({});
        }
      } else {
        setSerialBySoLine({});
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

      const companyId = soData?.company || "";
      const storeWhId = soData?.warehouse || "";
      const storeWh = wh.find((w) => w.id === storeWhId) || null;
      let damagedWh: InvWarehouse | null =
        wh.find((w) => w.id === r.damaged_warehouse) ||
        wh.find(
          (w) =>
            w.warehouse_role === "damaged" &&
            (!companyId || !w.company || w.company === companyId),
        ) ||
        null;
      if (!damagedWh && companyId) {
        try {
          const d = await getDamagedWarehouse(companyId, pb);
          if (d) damagedWh = wh.find((w) => w.id === d.id) || (d as InvWarehouse);
        } catch {
          /* ignore */
        }
      }
      let transitWh: InvWarehouse | null =
        wh.find((w) => w.warehouse_role === "transit" && (!companyId || !w.company || w.company === companyId)) ||
        null;
      if (!transitWh && companyId) {
        try {
          const t = await getTransitWarehouse(companyId, pb);
          if (t) transitWh = wh.find((w) => w.id === t.id) || (t as InvWarehouse);
        } catch {
          /* ignore */
        }
      }
      setDestWarehouses({ store: storeWh, damaged: damagedWh, transit: transitWh });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("inventory.receivingRetur.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const isPenjualan = retur?.type === "penjualan";
  const onHold = retur ? isReturOnWmsHold(retur) : false;
  const awaitingWms =
    retur?.workflow_phase === "awaiting_wms" ||
    (!retur?.workflow_phase && retur?.status === "draft" && retur?.wms_receive_status !== "complete");
  const wmsDone = retur?.wms_receive_status === "complete";

  const destinationPreview = useMemo(() => {
    if (!claimDecision) return null;
    return {
      label: "Gudang sementara (hold)",
      warehouse: formatWarehouseLabel(destWarehouses.transit) || "Gudang sementara entitas",
    };
  }, [claimDecision, destWarehouses.transit]);

  const uploadOptionalMedia = async (): Promise<string | undefined> => {
    if (!retur || (!videoFile && photoFiles.length === 0)) return undefined;
    const form = new FormData();
    if (videoFile) form.append("video", videoFile);
    for (const photo of photoFiles) form.append("photos", photo);
    form.append("entity_kind", "sales_return");
    form.append("entity_id", retur.id);
    const mediaRes = await fetch("/api/wms/unboxing-video", { method: "POST", body: form });
    const mediaJson = (await mediaRes.json()) as { path?: string; error?: string };
    if (!mediaRes.ok) throw new Error(mediaJson.error || t("inventory.receivingRetur.errSaveMedia"));
    return mediaJson.path || undefined;
  };

  const goToReceive = async () => {
    setError("");
    try {
      await startSalesReturnWmsProcessApi(id);
      setUiStep("receive");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memulai proses WMS");
    }
  };

  const openDestModal = () => {
    setError("");
    if (!claimDecision) {
      setError("Pilih terima claim atau bantah claim dulu.");
      return;
    }
    const totalQty = lines.reduce((s, l) => s + (Number(receivedQty[l.id]) || 0), 0);
    if (totalQty <= 0) {
      setError("Qty diterima wajib diisi (minimal 1).");
      return;
    }
    if (claimDecision === "disagree" && disputeNote.trim().length < 5) {
      setError("Alasan bantah wajib diisi (min. 5 karakter).");
      return;
    }
    if (claimDecision === "disagree" && photoFiles.length === 0) {
      setError("Untuk bantah claim, foto wajib diunggah.");
      return;
    }
    setShowDestModal(true);
  };

  const handleFinish = async () => {
    if (!retur || !claimDecision) return;
    setConfirming(true);
    setError("");
    try {
      const unboxingPath = await uploadOptionalMedia();
      await confirmSalesReturnWmsReceiveApi(retur.id, {
        claim_decision: claimDecision,
        dispute_note: claimDecision === "disagree" ? disputeNote.trim() : undefined,
        wms_note: wmsNote.trim() || undefined,
        unboxing_video_path: unboxingPath,
        received_lines: lines.map((l) => ({
          line_id: l.id,
          product: l.product,
          qty: receivedQty[l.id] ?? l.qty,
          // Kondisi final ditentukan bisnis setelah hold — WMS hanya qty + putusan claim.
          condition: "good" as const,
        })),
      });
      setShowDestModal(false);
      setVideoFile(null);
      setPhotoFiles([]);
      router.push("/gudang/penerimaan");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("inventory.receivingRetur.errConfirm"));
      setConfirming(false);
    }
  };

  const savedMedia = parseUnboxingMedia(retur?.unboxing_video_path);
  const createdByName =
    retur?.expand?.created_by?.name?.trim() ||
    retur?.expand?.created_by?.email?.trim() ||
    "";

  return (
    <InventoryGate>
      <InventoryShell
        title={t("inventory.receivingRetur.title")}
        subtitle=""
        module="wms"
      >
        <Link href="/gudang/penerimaan" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("inventory.receivingRetur.backToQueue")}
        </Link>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : !retur ? (
          <p className="text-slate-500">{t("inventory.receivingRetur.notFound")}</p>
        ) : !isPenjualan ? (
          <WmsCard padding="p-5">
            <p className="text-sm text-slate-600">{t("inventory.receivingRetur.purchaseReturnHint")}</p>
          </WmsCard>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {onHold ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-semibold">Hold — menunggu putusan bisnis</p>
                <p className="mt-1 text-xs text-amber-900/90">
                  WMS sudah membantah claim. Tidak ada aksi gudang lagi. Tim bisnis memutuskan di
                  modul Retur (Ubah kondisi/gudang, Setuju, atau Kirim kembali). Stok di gudang
                  sementara — retur belum ditutup.
                </p>
              </div>
            ) : null}

            {wmsDone && !onHold ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                <p className="font-semibold">Diterima WMS (hold) — menunggu putusan bisnis</p>
                <p className="mt-1 text-xs text-sky-900/90">
                  Penerimaan fisik selesai; stok di gudang sementara. Retur belum ditutup. Gudang
                  final (asal / rusak) atau kirim kembali ditentukan bisnis.
                </p>
              </div>
            ) : null}

            {/* STEP 1 — intake tanpa gudang/pembeli */}
            <WmsCard padding="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Informasi retur</h2>
              <div className="space-y-3">
                <div>
                  <p className="font-mono text-lg font-bold text-slate-900">{returDisplayNo(retur)}</p>
                  {returHasPlatformNo(retur) ? (
                    <p className="mt-0.5 text-xs text-slate-500">Sistem: {retur.retur_no}</p>
                  ) : null}
                </div>
                <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      No. INV
                    </dt>
                    <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-800">
                      {invoice?.invoice_no ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Toko penjual
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                      {invoice?.expand?.store?.name?.trim() || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Dibuat oleh
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                      {createdByName || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Tanggal dibuat
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                      {retur.created
                        ? new Date(retur.created).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Pengembalian
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                      {(() => {
                        const method =
                          retur.return_method === "courier"
                            ? "Via ekspedisi"
                            : retur.return_method === "dropoff"
                              ? "Drop-off / toko"
                              : null;
                        const parts = [
                          method,
                          retur.return_courier?.trim() || null,
                          retur.return_tracking_no?.trim()
                            ? `resi ${retur.return_tracking_no.trim()}`
                            : null,
                        ].filter(Boolean);
                        return parts.length > 0 ? parts.join(" · ") : "—";
                      })()}
                    </dd>
                  </div>
                </dl>
              </div>
              {wmsDone ? (
                <p className="mt-3 text-xs font-medium text-sky-800">
                  Paket dinyatakan tiba — hold sampai putusan bisnis
                </p>
              ) : null}
            </WmsCard>

            <WmsCard padding="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Instruksi bisnis</h2>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Alasan retur
                  </p>
                  <p className="mt-2 min-h-[4.5rem] whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {retur.reason?.trim() || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-800/80">
                    Instruksi bisnis
                  </p>
                  <p className="mt-2 min-h-[4.5rem] whitespace-pre-wrap text-sm leading-relaxed text-amber-950">
                    {retur.notes_for_wms?.trim() ||
                      "Tidak ada instruksi dari bisnis.\nPeriksa paket sesuai claim.\nCatat qty diterima lalu setuju atau bantah claim."}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="border-b border-slate-100 pb-2 font-medium">Produk / SN</th>
                      <th className="border-b border-slate-100 pb-2 text-right font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const serials = line.sales_order_line
                        ? serialBySoLine[line.sales_order_line] ?? []
                        : [];
                      return (
                        <tr key={line.id}>
                          <td className="border-b border-slate-50 py-3 pr-3">
                            <p className="font-medium text-slate-800">
                              {line.expand?.product?.name ?? line.product}
                            </p>
                            {serials.length > 0 ? (
                              <p className="mt-1 font-mono text-[11px] text-indigo-700">
                                SN: {serials.join(", ")}
                              </p>
                            ) : (
                              <p className="mt-1 text-[11px] text-slate-400">Tanpa SN</p>
                            )}
                          </td>
                          <td className="border-b border-slate-50 py-3 text-right font-semibold tabular-nums">
                            {line.qty}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {awaitingWms && uiStep === "preview" ? (
                <button
                  type="button"
                  onClick={() => void goToReceive()}
                  className="mt-4 w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  Lanjutkan
                </button>
              ) : null}
            </WmsCard>

            {/* STEP 2 — qty + claim decision + media */}
            {awaitingWms && uiStep === "receive" ? (
              <WmsCard padding="p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-800">Penerimaan WMS</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setUiStep("preview");
                      setShowDestModal(false);
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    ← Kembali
                  </button>
                </div>
                <p className="mb-4 whitespace-pre-line text-xs leading-relaxed text-slate-500">
                  {`Nyatakan paket sudah tiba di gudang, lalu isi qty yang diterima.
Pilih terima atau bantah claim bisnis — tanpa menentukan baik/rusak di langkah ini.
Gudang final dan penyelesaian ditentukan bisnis setelah klarifikasi.`}
                </p>

                <div className="space-y-3">
                  {lines.map((line) => {
                    const serials = line.sales_order_line
                      ? serialBySoLine[line.sales_order_line] ?? []
                      : [];
                    return (
                      <div
                        key={line.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-3"
                      >
                        <p className="text-sm font-medium text-slate-800">
                          {line.expand?.product?.name ?? line.product}
                        </p>
                        {serials.length > 0 ? (
                          <p className="mt-0.5 font-mono text-[11px] text-indigo-700">
                            SN: {serials.join(", ")}
                          </p>
                        ) : null}
                        <label className="mt-2 block text-sm">
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
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm"
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>

                <fieldset className="mt-4">
                  <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Putusan claim bisnis
                  </legend>
                  <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-500">
                    {`Pilih satu: terima claim bisnis atau bantah claim bisnis.
Stok masuk gudang sementara (hold) setelah dikirim.
Tujuan gudang final ditetapkan bisnis, bukan di langkah WMS ini.`}
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                      <input
                        type="radio"
                        name="claim"
                        checked={claimDecision === "agree"}
                        onChange={() => {
                          setClaimDecision("agree");
                          setPhotoFiles([]);
                          setVideoFile(null);
                        }}
                      />
                      <span className="font-medium text-emerald-800">Terima claim bisnis</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                      <input
                        type="radio"
                        name="claim"
                        checked={claimDecision === "disagree"}
                        onChange={() => setClaimDecision("disagree")}
                      />
                      <span className="font-medium text-amber-900">Bantah claim bisnis</span>
                    </label>
                  </div>
                </fieldset>

                {claimDecision === "agree" ? (
                  <div className="mt-4 space-y-3">
                    <label className="block text-sm">
                      <span className="text-xs text-slate-500">Pernyataan WMS (opsional)</span>
                      <textarea
                        rows={3}
                        value={wmsNote}
                        disabled={confirming}
                        onChange={(e) => setWmsNote(e.target.value)}
                        placeholder={
                          "Tulis pernyataan penerimaan paket.\nMisalnya kondisi fisik yang terlihat.\nCatatan lain untuk tim bisnis (opsional)."
                        }
                        className="mt-1 min-h-[4.5rem] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                          <Camera className="h-3.5 w-3.5" /> Foto (opsional)
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
                          <Video className="h-3.5 w-3.5" /> Video (opsional)
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
                ) : null}

                {claimDecision === "disagree" ? (
                  <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                    <label className="block text-sm">
                      <span className="text-xs font-medium text-amber-900">Alasan bantah *</span>
                      <textarea
                        rows={3}
                        value={disputeNote}
                        disabled={confirming}
                        onChange={(e) => setDisputeNote(e.target.value)}
                        placeholder="Jelaskan kenapa claim bisnis dibantah…"
                        className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-900">
                          <Camera className="h-3.5 w-3.5" /> Foto * (wajib)
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={confirming}
                          onChange={(e) => setPhotoFiles([...(e.target.files ?? [])])}
                          className="text-xs"
                        />
                        {photoFiles.length > 0 ? (
                          <p className="mt-1 text-[11px] text-emerald-700">
                            {photoFiles.length} foto dipilih
                          </p>
                        ) : null}
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                          <Video className="h-3.5 w-3.5" /> Video (opsional)
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
                ) : null}

                <button
                  type="button"
                  disabled={confirming || !claimDecision}
                  onClick={openDestModal}
                  className="mt-4 w-full rounded-lg bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Kirim
                </button>
              </WmsCard>
            ) : null}

            {/* Hasil / bukti setelah selesai */}
            {wmsDone ? (
              <WmsCard padding="p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-sky-900">
                  <CheckCircle2 className="h-4 w-4" /> Diterima WMS (hold)
                </h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Keputusan claim</dt>
                    <dd className="font-medium text-slate-800">
                      {retur.wms_claim_decision === "disagree" ? "Bantah claim" : "Terima claim"}
                    </dd>
                  </div>
                  {retur.wms_dispute_note?.trim() ? (
                    <div>
                      <dt className="text-slate-500">Alasan bantah</dt>
                      <dd className="mt-0.5 text-slate-800">{retur.wms_dispute_note}</dd>
                    </div>
                  ) : null}
                  {retur.wms_note?.trim() ? (
                    <div>
                      <dt className="text-slate-500">Pernyataan WMS</dt>
                      <dd className="mt-0.5 text-slate-800">{retur.wms_note}</dd>
                    </div>
                  ) : null}
                </dl>
                {savedMedia.video || (savedMedia.photos?.length ?? 0) > 0 ? (
                  <div className="mt-3 space-y-2">
                    {savedMedia.video ? (
                      <video
                        controls
                        className="max-h-48 w-full rounded-lg bg-black"
                        src={unboxingMediaApiUrl(retur.id, "video")}
                      />
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {(savedMedia.photos ?? []).map((_, i) => (
                        <a
                          key={i}
                          href={unboxingMediaApiUrl(retur.id, "photo", i)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={unboxingMediaApiUrl(retur.id, "photo", i)}
                            alt={`Foto ${i + 1}`}
                            className="h-20 w-20 rounded object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </WmsCard>
            ) : null}

            {/* STEP 3 — popup gudang */}
            {showDestModal && destinationPreview ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Konfirmasi hold</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Stok masuk gudang sementara. Retur belum ditutup — putusan gudang final
                        oleh bisnis.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={() => setShowDestModal(false)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Tutup"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  {error ? (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}
                  <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-violet-700">
                      {destinationPreview.label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-violet-950">
                      {destinationPreview.warehouse}
                    </p>
                    <p className="mt-2 text-xs text-violet-800">
                      Hold sampai bisnis menentukan: gudang asal, gudang rusak, atau kirim kembali.
                    </p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={() => setShowDestModal(false)}
                      className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Tutup
                    </button>
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={() => void handleFinish()}
                      className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {confirming ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…
                        </span>
                      ) : (
                        "Kirim"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </InventoryShell>
    </InventoryGate>
  );
}
