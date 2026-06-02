"use client";

import { useCallback, useState } from "react";
import { Loader2, Scan, Truck } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { WmsCard, WmsPrimaryButton, WmsSectionTitle } from "@/components/wms/ui";
import { OutboundFlowBar } from "@/components/wms/OutboundFlowBar";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import {
  getOutboundStageFromSo,
  parseBookingQrPayload,
  parseOutboundWorkflow,
} from "@/lib/wms/outbound-workflow";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";
import { getErrorMessage } from "@/lib/errors";

async function uploadPhotos(soId: string, warehouse: string, files: FileList | null) {
  if (!files?.length) return [] as string[];
  const fd = new FormData();
  fd.set("entity_type", "biz_sales_orders");
  fd.set("entity_id", soId);
  fd.set("warehouse", warehouse);
  fd.set("purpose", "pickup");
  for (let i = 0; i < Math.min(files.length, 1); i++) {
    fd.append("files", files[i]);
  }
  const res = await fetch("/api/wms/photos", { method: "POST", body: fd, credentials: "include" });
  const json = (await res.json()) as { ok?: boolean; file_ids?: string[]; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? "Upload foto gagal");
  return json.file_ids ?? [];
}

export default function WmsPickupPage() {
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [scanCode, setScanCode] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadSo = useCallback(async (code: string) => {
    setLoading(true);
    setError("");
    try {
      const ref = parseBookingQrPayload(code) ?? code.trim();
      const list = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 1, {
        filter: `wms_booking_no = "${ref}" || order_no = "${ref}"`,
        expand: "warehouse,customer",
      });
      if (!list.items.length) throw new Error("Order tidak ditemukan");
      const row = list.items[0];
      const wf = parseOutboundWorkflow(row.outbound_workflow_json);
      if (wf.stage !== "pack_done" && row.warehouse_process_status !== "complete") {
        throw new Error("Packing belum selesai — selesaikan validasi & packing dulu.");
      }
      setSo(row);
    } catch (e) {
      setSo(null);
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const completePickup = async () => {
    if (!so) return;
    if (!driverName.trim()) {
      setError("Nama driver wajib");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error("Login ulang");
      const photoIds = photo
        ? await uploadPhotos(so.id, so.warehouse, Object.assign([photo], { length: 1 }) as unknown as FileList)
        : [];
      await updateSalesWarehouseProcess(so.id, userId, "complete_pickup", {
        userName: pb.authStore.model?.name as string | undefined,
        pickup: {
          mode: mode === "scan" ? "scan_label" : "manual_booking",
          driver_name: driverName.trim(),
          driver_phone: driverPhone.trim(),
          user_id: userId,
          at: new Date().toISOString(),
          photo_file_ids: photoIds,
          signature_captured: true,
          receipt_printed: false,
        },
      });
      alert(`Pickup ${so.order_no} selesai.`);
      setSo(null);
      setDriverName("");
      setDriverPhone("");
      setPhoto(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const stage = so ? getOutboundStageFromSo(so) : "pack_done";

  return (
    <InventoryGate>
      <InventoryShell
        title="Ready to Pickup"
        subtitle="Serah ke kurir / pickup — dokumentasi driver & foto."
        module="wms"
      >
        <OutboundFlowBar stage={stage} />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("scan")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === "scan" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
          >
            Scan label kirim
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === "manual" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
          >
            Cari manual (booking)
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!so ? (
          <WmsCard>
            <WmsSectionTitle
              title={mode === "scan" ? "Scan label pengiriman" : "Cari nomor booking"}
            />
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadSo(scanCode)}
                placeholder={mode === "scan" ? "No. resi / label" : "BKG-…"}
              />
              <WmsPrimaryButton type="button" disabled={loading} onClick={() => void loadSo(scanCode)}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
              </WmsPrimaryButton>
            </div>
          </WmsCard>
        ) : (
          <WmsCard>
            <WmsSectionTitle title={so.order_no} subtitle={`Booking ${so.wms_booking_no ?? "—"}`} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Nama driver / pickup
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                No. HP
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                />
              </label>
            </div>
            <label className="mt-3 block text-sm">
              Foto dokumentasi (1 file, max 3MP disarankan)
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="mt-1 block w-full text-sm"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            <WmsPrimaryButton
              className="mt-4 w-full"
              disabled={saving}
              onClick={() => void completePickup()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Truck className="mr-2 inline h-4 w-4" />
              )}
              Simpan pickup & selesai
            </WmsPrimaryButton>
          </WmsCard>
        )}
      </InventoryShell>
    </InventoryGate>
  );
}
