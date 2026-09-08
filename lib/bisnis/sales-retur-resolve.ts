import type PocketBase from "pocketbase";
import { resolveProcessActorName } from "@/lib/bisnis/process-actor";
import {
  serializeResendShipping,
  type ResendShippingInfo,
} from "@/lib/bisnis/sales-retur-resend-shipping";
import { BISNIS_COLLECTIONS, type Retur, type ReturLine } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { generateUniquePickupCode } from "@/lib/pos/pickup-code";

/**
 * Bisnis menerima klarifikasi WMS (bantahan) — hold tetap sampai tombol Selesai.
 * Stok belum dipindah; hanya mencatat putusan.
 */
export async function acceptWmsClarification(
  pb: PocketBase,
  returId: string,
  userId: string,
): Promise<Retur> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.type !== "penjualan") throw new Error("Hanya retur penjualan.");
  if (retur.status === "completed" || retur.status === "cancelled") {
    throw new Error("Retur sudah ditutup.");
  }
  if (retur.wms_receive_status !== "complete") {
    throw new Error("WMS belum menerima barang.");
  }
  if (retur.wms_claim_decision !== "disagree" && retur.exception_status !== "open") {
    throw new Error("Putusan ini hanya untuk klaim yang dibantah WMS.");
  }
  if (retur.workflow_phase === "resend") {
    throw new Error("Retur sudah masuk alur kirim kembali.");
  }

  const actor = await resolveProcessActorName(pb, userId);
  return pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
    business_resolution: "accept_wms",
    exception_status: "resolved",
    workflow_phase: "awaiting_business",
    business_processed_by: userId,
    business_processed_by_name: actor,
    ...(retur.business_process_started_at
      ? {}
      : { business_process_started_at: new Date().toISOString() }),
  });
}

export type RejectReturForResendOpts = {
  method?: "pickup" | "ship";
  shipping?: Partial<ResendShippingInfo> | null;
};

/**
 * Tolak retur → status Kirim kembali.
 * Stok tetap di gudang sementara (hold); WMS menjalankan pickup/pengiriman ke pelanggan.
 */
export async function rejectReturForResend(
  pb: PocketBase,
  returId: string,
  userId: string,
  opts?: RejectReturForResendOpts,
): Promise<Retur> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.type !== "penjualan") throw new Error("Hanya retur penjualan.");
  if (retur.status === "completed" || retur.status === "cancelled") {
    throw new Error("Retur sudah ditutup.");
  }
  if (retur.wms_receive_status !== "complete") {
    throw new Error("WMS belum menerima barang — tidak ada hold yang perlu dikirim kembali.");
  }
  if (retur.workflow_phase === "resend") {
    return retur;
  }

  const method = opts?.method === "ship" ? "ship" : "pickup";
  let shippingJson = "";
  if (method === "ship") {
    const courier = opts?.shipping?.courier?.trim() || "";
    const service = opts?.shipping?.shipping_service?.trim() || "";
    const address = opts?.shipping?.recipient_address?.trim() || "";
    if (!courier) throw new Error("Ekspedisi wajib diisi untuk mode kirim.");
    if (!service) throw new Error("Layanan pengiriman wajib diisi.");
    if (!address) throw new Error("Alamat penerima wajib diisi.");
    shippingJson = serializeResendShipping({
      courier,
      shipping_service: service,
      recipient_address: address,
      shipping_cost: Math.max(0, Number(opts?.shipping?.shipping_cost) || 0),
      shipping_payer: opts?.shipping?.shipping_payer === "customer" ? "customer" : "seller",
    });
  }

  const pickupNo = await generateUniquePickupCode(pb);
  const actor = await resolveProcessActorName(pb, userId);
  const now = new Date().toISOString();

  const lines = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLine>({
    filter: `retur = "${returId}"`,
    expand: "product",
    requestKey: null,
  });

  const updated = await pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
    business_resolution: "resend",
    workflow_phase: "resend",
    exception_status: "resolved",
    resend_pickup_no: pickupNo,
    resend_method: method,
    resend_shipping_json: shippingJson,
    business_processed_by: userId,
    business_processed_by_name: actor,
    business_process_completed_at: now,
    ...(retur.business_process_started_at ? {} : { business_process_started_at: now }),
  });

  try {
    const shipping =
      method === "ship" && shippingJson
        ? {
            courier: opts?.shipping?.courier?.trim(),
            shipping_service: opts?.shipping?.shipping_service?.trim(),
            recipient_address: opts?.shipping?.recipient_address?.trim(),
            shipping_cost: Math.max(0, Number(opts?.shipping?.shipping_cost) || 0),
            shipping_payer:
              opts?.shipping?.shipping_payer === "customer" ? "customer" : "seller",
          }
        : undefined;
    await pb.collection(INV_COLLECTIONS.staffActivities).create({
      user: userId,
      warehouse: retur.warehouse,
      activity_type: "wms.sales_return_resend",
      entity_type: "biz_returs",
      entity_id: returId,
      entity_label: retur.retur_no,
      payload: {
        status: "pending",
        method,
        pickup_no: pickupNo,
        retur_no: retur.retur_no,
        shipping,
        lines: lines.map((l) => ({
          product: l.product,
          qty: Number(l.actual_qty ?? l.qty) || 0,
          name: l.expand?.product?.name,
          sku: l.expand?.product?.sku,
        })),
      },
    });
  } catch {
    /* aktivitas opsional jika collection belum siap */
  }

  return updated;
}
