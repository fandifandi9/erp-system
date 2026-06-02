"use client";



import { useCallback, useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import Link from "next/link";

import {

  ArrowLeft,

  CheckCircle2,

  Loader2,

  PauseCircle,

} from "lucide-react";

import { InventoryGate } from "@/components/inventory/InventoryGate";

import { InventoryShell } from "@/components/inventory/InventoryShell";

import { ReceivingWorkflowPanel } from "@/components/wms/ReceivingWorkflowPanel";

import {

  WmsBadge,

  WmsCard,

  WmsPrimaryButton,

  WmsSectionTitle,

} from "@/components/wms/ui";

import { pb } from "@/lib/pocketbase";

import { fetchWarehouses } from "@/lib/inventory/client";

import {

  fetchPurchaseOrder,

  fetchPurchaseOrderLines,

  getWarehouseProcessStatus,

  updateWarehouseProcess,

  WAREHOUSE_PROCESS_STATUS_UI,

  fmtWarehouseProcessedAt,

} from "@/lib/bisnis/client";

import {

  countWorkflowProgress,

  validateReceivingWorkflowComplete,

  type ReceivingWorkflow,

} from "@/lib/wms/receiving-workflow";

import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/bisnis/types";

import type { InvWarehouse } from "@/lib/inventory/types";

import { getErrorMessage } from "@/lib/errors";



const fmtNum = (v: number) => new Intl.NumberFormat("id-ID").format(v);



export default function GudangPenerimaanDetailPage() {

  const { id } = useParams<{ id: string }>();

  const router = useRouter();

  const [po, setPo] = useState<PurchaseOrder | null>(null);

  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);

  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [workflow, setWorkflow] = useState<ReceivingWorkflow>({ lines: {} });



  const [suratJalanNo, setSuratJalanNo] = useState("");

  const [verified, setVerified] = useState(false);

  const [holdNote, setHoldNote] = useState("");

  const [receivingWarehouse, setReceivingWarehouse] = useState("");



  const load = useCallback(async () => {

    setLoading(true);

    setError("");

    try {

      const [poData, poLines, wh] = await Promise.all([

        fetchPurchaseOrder(id),

        fetchPurchaseOrderLines(id),

        fetchWarehouses(),

      ]);

      setPo(poData);

      setLines(poLines);

      setWarehouses(wh);

      setSuratJalanNo(poData.surat_jalan_no ?? "");

      setVerified(!!poData.surat_jalan_verified);

      setHoldNote(poData.warehouse_hold_note ?? "");

      setReceivingWarehouse(poData.receiving_warehouse ?? "");

    } catch (e: unknown) {

      setError(getErrorMessage(e, "Gagal memuat PO"));

    } finally {

      setLoading(false);

    }

  }, [id]);



  useEffect(() => {

    void load();

  }, [load]);



  const runAction = async (

    action: "start_check" | "hold" | "complete",

    extra?: { process_mode?: "direct" | "hold" },

  ) => {

    const userId = pb.authStore.model?.id as string | undefined;

    if (!userId) {

      alert("Silakan login ulang");

      return;

    }

    if (action !== "hold" && !verified) {

      alert("Centang verifikasi surat jalan terlebih dahulu.");

      return;

    }

    if (action === "complete") {

      const wfErr = validateReceivingWorkflowComplete(lines, workflow);

      if (wfErr) {

        alert(wfErr);

        return;

      }

    }

    setSaving(true);

    setError("");

    try {

      await updateWarehouseProcess(id, userId, action, {

        surat_jalan_no: suratJalanNo.trim() || undefined,

        surat_jalan_verified: verified,

        note: holdNote.trim() || undefined,

        receiving_warehouse: receivingWarehouse || undefined,

        process_mode: extra?.process_mode,

      });

      await load();

      if (action === "complete") {

        router.push("/gudang/penerimaan");

      }

    } catch (e: unknown) {

      setError(getErrorMessage(e, "Gagal menyimpan proses gudang"));

    } finally {

      setSaving(false);

    }

  };



  if (loading) {

    return (

      <InventoryGate>

        <div className="flex min-h-[50vh] items-center justify-center">

          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />

        </div>

      </InventoryGate>

    );

  }



  if (!po) {

    return (

      <InventoryGate>

        <div className="px-6 py-12 text-center text-red-600">{error || "PO tidak ditemukan"}</div>

      </InventoryGate>

    );

  }



  const whStatus = getWarehouseProcessStatus(po);

  const st = whStatus ? WAREHOUSE_PROCESS_STATUS_UI[whStatus] : null;

  const orderer = po.expand?.created_by?.name || po.expand?.created_by?.email || "—";

  const processor =

    po.expand?.warehouse_processed_by?.name || po.expand?.warehouse_processed_by?.email;

  const isComplete = whStatus === "complete";

  const isHold = whStatus === "hold";

  const showWorkflow =

    !isComplete && (whStatus === "checking" || whStatus === "hold" || whStatus === "processing");

  const progress = countWorkflowProgress(

    lines.map((l) => l.id),

    workflow,

  );

  const workflowReady =

    progress.total > 0 &&

    progress.qc === progress.total &&

    progress.putaway === progress.total;



  return (

    <InventoryGate>

      <InventoryShell

        title={po.po_no}

        subtitle={`Penerimaan dari ${po.expand?.supplier?.name ?? "supplier"}`}

        module="wms"

      >

        <Link

          href="/gudang/penerimaan"

          className="inline-flex items-center gap-1 text-sm text-indigo-600"

        >

          <ArrowLeft className="h-3.5 w-3.5" /> Daftar penerimaan

        </Link>



        {error ? (

          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">

            {error}

          </div>

        ) : null}



        <div className="flex flex-wrap items-center gap-2">

          {st && (

            <WmsBadge

              tone={

                whStatus === "hold" ? "amber" : whStatus === "complete" ? "emerald" : "indigo"

              }

            >

              Gudang: {st.label}

            </WmsBadge>

          )}

          {processor && po.warehouse_processed_at && (

            <span className="text-xs text-slate-500">

              {processor} — {fmtWarehouseProcessedAt(po.warehouse_processed_at)}

            </span>

          )}

        </div>



        <div className="grid gap-6 lg:grid-cols-3">

          <div className="space-y-4 lg:col-span-2">

            <WmsCard>

              <WmsSectionTitle title="Data pesanan (dari admin bisnis)" />

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">

                <div>

                  <dt className="text-slate-500">Supplier</dt>

                  <dd className="font-medium">{po.expand?.supplier?.name ?? "—"}</dd>

                </div>

                <div>

                  <dt className="text-slate-500">Pemesan (admin bisnis)</dt>

                  <dd className="font-medium">{orderer}</dd>

                </div>

                <div>

                  <dt className="text-slate-500">Gudang tujuan</dt>

                  <dd className="font-medium">{po.expand?.warehouse?.name ?? "—"}</dd>

                </div>

                <div>

                  <dt className="text-slate-500">Dikirim ke gudang</dt>

                  <dd className="font-medium">{fmtWarehouseProcessedAt(po.send_to_warehouse_at)}</dd>

                </div>

              </dl>

            </WmsCard>



            <WmsCard>

              <WmsSectionTitle title="Item pesanan" subtitle="Samakan dengan surat jalan supplier" />

              <div className="mt-4 overflow-x-auto">

                <table className="w-full text-sm">

                  <thead>

                    <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">

                      <th className="px-3 py-2">Produk</th>

                      <th className="px-3 py-2">SKU</th>

                      <th className="px-3 py-2 text-center">Qty PO</th>

                    </tr>

                  </thead>

                  <tbody>

                    {lines.map((l) => (

                      <tr key={l.id} className="border-b border-slate-50">

                        <td className="px-3 py-2">{l.expand?.product?.name ?? "—"}</td>

                        <td className="px-3 py-2 font-mono text-xs text-slate-600">

                          {l.expand?.product?.sku ?? "—"}

                        </td>

                        <td className="px-3 py-2 text-center font-medium">{fmtNum(l.qty)}</td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            </WmsCard>



            {showWorkflow && (

              <ReceivingWorkflowPanel

                po={po}

                lines={lines}

                onWorkflowChange={setWorkflow}

              />

            )}



            {!isComplete && (

              <WmsCard>

                <WmsSectionTitle title="Verifikasi surat jalan" />

                <div className="mt-4 space-y-4">

                  <label className="block text-sm">

                    <span className="font-medium text-slate-700">No. surat jalan supplier</span>

                    <input

                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"

                      value={suratJalanNo}

                      onChange={(e) => setSuratJalanNo(e.target.value)}

                      placeholder="SJ-2026-001"

                    />

                  </label>

                  <label className="flex cursor-pointer items-start gap-3 text-sm">

                    <input

                      type="checkbox"

                      className="mt-1"

                      checked={verified}

                      onChange={(e) => setVerified(e.target.checked)}

                    />

                    <span>

                      Saya sudah mencocokkan: <strong>nama supplier</strong>,{" "}

                      <strong>nama produk</strong>, <strong>jumlah</strong>, dan{" "}

                      <strong>referensi PO</strong> dengan surat jalan.

                    </span>

                  </label>

                </div>

              </WmsCard>

            )}

          </div>



          <div className="space-y-4">

            {!isComplete && whStatus === "pending" && (

              <WmsCard>

                <WmsSectionTitle title="Mulai verifikasi" />

                <p className="mt-2 text-xs text-slate-500">

                  Tandai PO sedang dicek team gudang, lalu lakukan QC / label / putaway di bawah.

                </p>

                <div className="mt-4">

                  <WmsPrimaryButton

                    disabled={saving}

                    onClick={() => void runAction("start_check")}

                  >

                    {saving ? "Menyimpan…" : "Mulai cek surat jalan"}

                  </WmsPrimaryButton>

                </div>

              </WmsCard>

            )}



            {showWorkflow && (

              <WmsCard className="border-emerald-200 bg-emerald-50/50">

                <WmsSectionTitle title="Selesaikan penerimaan" subtitle="Opsi A — Sempat" />

                <ul className="mt-2 space-y-1 text-xs text-slate-600">

                  <li>

                    QC: {progress.qc}/{progress.total} item

                  </li>

                  <li>

                    Label: {progress.label}/{progress.total} item (cetak stiker)

                  </li>

                  <li>

                    Putaway: {progress.putaway}/{progress.total} item

                  </li>

                </ul>

                <div className="mt-4">

                  <WmsPrimaryButton

                    disabled={saving || !verified || !workflowReady}

                    onClick={() => void runAction("complete", { process_mode: "direct" })}

                  >

                    <CheckCircle2 className="mr-1.5 inline h-4 w-4" />

                    {saving ? "Menyimpan…" : "Tandai Komplit"}

                  </WmsPrimaryButton>

                  {!workflowReady && (

                    <p className="mt-2 text-xs text-amber-800">

                      Lengkapi centang QC dan putaway semua item terlebih dahulu.

                    </p>

                  )}

                </div>

              </WmsCard>

            )}



            {showWorkflow && !isHold && (

              <WmsCard className="border-amber-200 bg-amber-50/50">

                <WmsSectionTitle title="Opsi B — Overload (Hold)" subtitle="Simpan di gudang penerimaan sementara" />

                <label className="mt-3 block text-sm">

                  <span className="font-medium text-slate-700">Gudang penerimaan sementara</span>

                  <select

                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"

                    value={receivingWarehouse}

                    onChange={(e) => setReceivingWarehouse(e.target.value)}

                  >

                    <option value="">— Pilih —</option>

                    {warehouses.map((w) => (

                      <option key={w.id} value={w.id}>

                        {w.code} — {w.name}

                      </option>

                    ))}

                  </select>

                </label>

                <label className="mt-3 block text-sm">

                  <span className="font-medium text-slate-700">Catatan laporan penerimaan</span>

                  <textarea

                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"

                    rows={3}

                    value={holdNote}

                    onChange={(e) => setHoldNote(e.target.value)}

                    placeholder="Kondisi barang, lokasi sementara, dll."

                  />

                </label>

                <div className="mt-4">

                  <button

                    type="button"

                    disabled={saving}

                    onClick={() => void runAction("hold")}

                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-50 disabled:opacity-50"

                  >

                    <PauseCircle className="h-4 w-4" />

                    {saving ? "Menyimpan…" : "Simpan Hold"}

                  </button>

                </div>

              </WmsCard>

            )}



            {isHold && showWorkflow && (

              <WmsCard className="border-indigo-200 bg-indigo-50/50">

                <WmsSectionTitle title="Lanjutkan dari Hold" subtitle="Selesaikan QC / label / putaway lalu Komplit" />

                {po.warehouse_hold_note && (

                  <p className="mt-2 text-xs text-slate-600">Catatan: {po.warehouse_hold_note}</p>

                )}

                <div className="mt-4">

                  <WmsPrimaryButton

                    disabled={saving || !verified || !workflowReady}

                    onClick={() => void runAction("complete", { process_mode: "hold" })}

                  >

                    <CheckCircle2 className="mr-1.5 inline h-4 w-4" />

                    {saving ? "Menyimpan…" : "Selesai — Tandai Komplit"}

                  </WmsPrimaryButton>

                </div>

              </WmsCard>

            )}



            {isComplete && (

              <WmsCard className="border-emerald-200 bg-emerald-50">

                <p className="text-sm font-semibold text-emerald-900">Proses gudang selesai (Komplit)</p>

                <p className="mt-1 text-xs text-emerald-800">

                  Admin bisnis sudah bisa membuat tagihan (BILL) untuk PO ini.

                </p>

              </WmsCard>

            )}

          </div>

        </div>

      </InventoryShell>

    </InventoryGate>

  );

}


