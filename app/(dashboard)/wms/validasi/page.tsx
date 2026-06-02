"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Loader2, Scan, CheckCircle2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { WmsCard, WmsPrimaryButton, WmsSectionTitle } from "@/components/wms/ui";
import { OutboundFlowBar } from "@/components/wms/OutboundFlowBar";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import {
  mergeOutboundLinesFromSo,
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  isValidateComplete,
  parseBookingQrPayload,
  OUTBOUND_STAGE_UI,
  type ValidatePosition,
} from "@/lib/wms/outbound-workflow";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";
import { validateBarcodeScan } from "@/lib/wms/validations";
import { getErrorMessage } from "@/lib/errors";

export default function WmsValidasiPage() {
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [position, setPosition] = useState<ValidatePosition | null>(null);
  const [scanRef, setScanRef] = useState("");
  const [scanProduct, setScanProduct] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadByRef = useCallback(async (code: string) => {
    setLoading(true);
    setError("");
    try {
      const booking = parseBookingQrPayload(code) ?? code.trim();
      let list;
      try {
        list = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 1, {
          filter: `wms_booking_no = "${booking}" || order_no = "${booking}"`,
          expand: "warehouse,customer",
        });
      } catch {
        list = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 1, {
          filter: `order_no = "${booking}"`,
          expand: "warehouse,customer",
        });
      }
      if (list.items.length === 0) throw new Error("SO / booking tidak ditemukan");
      const row = list.items[0];
      const wf = parseOutboundWorkflow(row.outbound_workflow_json);
      if (wf.stage === "pick_pending") {
        throw new Error("Picking belum selesai — selesaikan di halaman Picking dulu.");
      }
      setSo(row);
    } catch (e) {
      setSo(null);
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const wf = so ? parseOutboundWorkflow(so.outbound_workflow_json) : null;
  const lines = wf ? Object.values(wf.pick?.lines ?? {}) : [];

  const handleProductScan = async () => {
    if (!so || !wf || !position) return;
    try {
      const product = await validateBarcodeScan(scanProduct);
      const key = product.id;
      const line = wf.pick?.lines?.[key];
      if (!line) {
        setError(`Produk ${product.sku} tidak ada di order ini.`);
        return;
      }
      const nextValidated = line.qty_validated + 1;
      if (nextValidated > line.qty_required) {
        setError("Jumlah validasi melebihi pesanan.");
        return;
      }
      const nextWf = mergeOutboundLinesFromSo(
        {
          ...wf,
          validate: { position, user_id: "", at: "", user_name: undefined },
        },
        [],
      );
      nextWf.pick!.lines[key] = { ...line, qty_validated: nextValidated };
      await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(so.id, {
        outbound_workflow_json: serializeOutboundWorkflow(nextWf),
      });
      setSo({ ...so, outbound_workflow_json: serializeOutboundWorkflow(nextWf) });
      setScanProduct("");
      setError("");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const finishValidate = async () => {
    if (!so || !wf || !position) return;
    if (!isValidateComplete(wf)) {
      setError("Semua produk harus di-scan sampai jumlah lengkap.");
      return;
    }
    setSaving(true);
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error("Login ulang");
      const name = pb.authStore.model?.name;
      await updateSalesWarehouseProcess(so.id, userId, "complete_validate", {
        validatePosition: position,
        userName: typeof name === "string" ? name : undefined,
      });
      alert("Validasi selesai. Lanjut ke Packing.");
      setSo(null);
      setPosition(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const stage = wf?.stage ?? "pick_pending";

  return (
    <InventoryGate>
      <InventoryShell
        title="Validasi"
        subtitle="Pos A/B/C → scan booking/resi → scan produk satu per satu → lanjut packing."
        module="wms"
      >
        <OutboundFlowBar stage={stage} />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!so ? (
          <WmsCard>
            <WmsSectionTitle title="Scan booking atau nomor pelacakan" />
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm"
                placeholder="BKG-… / serba:booking:… / no. resi"
                value={scanRef}
                onChange={(e) => setScanRef(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadByRef(scanRef)}
              />
              <WmsPrimaryButton type="button" disabled={loading} onClick={() => void loadByRef(scanRef)}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
              </WmsPrimaryButton>
            </div>
          </WmsCard>
        ) : (
          <div className="space-y-4">
            <WmsCard>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono font-semibold text-indigo-700">{so.order_no}</p>
                  <p className="text-sm text-slate-600">
                    Booking: <span className="font-mono">{so.wms_booking_no ?? wf?.booking_no}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Gudang keluar: {so.expand?.warehouse?.name ?? "—"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${OUTBOUND_STAGE_UI[stage].cls}`}
                >
                  {OUTBOUND_STAGE_UI[stage].label}
                </span>
              </div>

              <p className="mt-4 text-sm font-medium text-slate-700">Pos kerja (scan posisi Anda):</p>
              <div className="mt-2 flex gap-2">
                {(["A", "B", "C"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPosition(p)}
                    className={
                      "flex-1 rounded-xl border-2 py-3 text-lg font-bold transition " +
                      (position === p
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:border-indigo-200")
                    }
                  >
                    Pos {p}
                  </button>
                ))}
              </div>
            </WmsCard>

            {position && (
              <WmsCard>
                <WmsSectionTitle title="Scan produk" subtitle={`Pos ${position} — semua baris harus hijau`} />
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm"
                    placeholder="Scan barcode produk"
                    value={scanProduct}
                    onChange={(e) => setScanProduct(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleProductScan()}
                  />
                  <WmsPrimaryButton type="button" onClick={() => void handleProductScan()}>
                    <Scan className="h-4 w-4" />
                  </WmsPrimaryButton>
                </div>
                <ul className="mt-4 space-y-2">
                  {lines.map((l) => {
                    const ok = l.qty_validated >= l.qty_required;
                    return (
                      <li
                        key={l.product_id}
                        className={
                          "flex justify-between rounded-xl border px-4 py-3 text-sm " +
                          (ok ? "border-emerald-200 bg-emerald-50" : "border-slate-200")
                        }
                      >
                        <span>
                          <span className="font-mono text-xs text-indigo-600">{l.sku}</span> {l.name}
                        </span>
                        <span className="font-semibold">
                          {l.qty_validated}/{l.qty_required}
                          {ok && <CheckCircle2 className="ml-1 inline h-4 w-4 text-emerald-600" />}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {wf && isValidateComplete(wf) && (
                  <WmsPrimaryButton className="mt-4 w-full" disabled={saving} onClick={() => void finishValidate()}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Selesai validasi → lanjut Packing
                  </WmsPrimaryButton>
                )}
              </WmsCard>
            )}

            <Link href="/wms/packing" className="text-sm font-medium text-indigo-600 hover:underline">
              Buka halaman Packing →
            </Link>
          </div>
        )}
      </InventoryShell>
    </InventoryGate>
  );
}
