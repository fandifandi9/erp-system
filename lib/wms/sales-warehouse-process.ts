import {
  fetchSalesOrder,
  fetchSalesOrderLines,
  updateSalesOrder,
} from "@/lib/bisnis/client";
import type { SalesOrder, WarehouseProcessMode, WarehouseProcessStatus } from "@/lib/bisnis/types";
import {
  isValidateComplete,
  mergeOutboundLinesFromSo,
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  type OutboundWorkflow,
  validateCanAdvanceToPack,
} from "./outbound-workflow";
import { nextBookingNo } from "./booking-number";
import { buildBookingQrPayload } from "./outbound-workflow";
import { logOutboundAudit } from "./outbound-audit";

export type SalesWarehouseAction =
  | "hold"
  | "release_hold"
  | "complete_pick"
  | "complete_validate"
  | "complete_pack"
  | "complete_pickup";

export async function updateSalesWarehouseProcess(
  soId: string,
  userId: string,
  action: SalesWarehouseAction,
  opts?: {
    note?: string;
    userName?: string;
    validatePosition?: "A" | "B" | "C";
    bookingNo?: string;
    trackingCode?: string;
    entryMode?: "manual" | "tracking_scan";
    pickup?: OutboundWorkflow["pickup"];
    packPhotoIds?: string[];
  },
): Promise<SalesOrder> {
  const so = await fetchSalesOrder(soId);
  if (!so.send_to_warehouse_at) {
    throw new Error("SO belum dikirim ke gudang.");
  }
  if (so.status === "cancelled") {
    throw new Error("SO dibatalkan.");
  }

  const now = new Date().toISOString();
  const lines = await fetchSalesOrderLines(soId);
  let wf = mergeOutboundLinesFromSo(parseOutboundWorkflow(so.outbound_workflow_json), lines);

  const base = {
    warehouse_processed_by: userId,
    warehouse_processed_at: now,
  };

  if (action === "hold") {
    const updated = await updateSalesOrder(soId, {
      ...base,
      warehouse_process_status: "hold",
      warehouse_hold_note: opts?.note?.trim() || undefined,
    });
    await logOutboundAudit({
      userId,
      warehouseId: so.warehouse,
      soId,
      orderNo: so.order_no,
      activityType: "wms.so_hold",
      payload: { note: opts?.note },
    });
    return updated;
  }

  if (action === "release_hold") {
    return updateSalesOrder(soId, {
      ...base,
      warehouse_process_status: "checking",
      warehouse_hold_note: "",
    });
  }

  if (action === "complete_pick") {
    const booking =
      opts?.bookingNo?.trim() ||
      so.wms_booking_no ||
      (await nextBookingNo(so.order_date));
    const qr = buildBookingQrPayload(booking);
    wf = {
      ...wf,
      stage: "validate_pending",
      entry_mode: opts?.entryMode ?? wf.entry_mode,
      tracking_code: opts?.trackingCode ?? wf.tracking_code,
      booking_no: booking,
      booking_qr_payload: qr,
      pick: {
        ...wf.pick!,
        user_id: userId,
        user_name: opts?.userName,
        at: now,
        lines: wf.pick?.lines ?? {},
      },
    };
    const updated = await updateSalesOrder(soId, {
      ...base,
      wms_booking_no: booking,
      outbound_workflow_json: serializeOutboundWorkflow(wf),
      warehouse_process_status: "checking",
      status: so.status === "draft" ? "processing" : so.status,
    });
    await logOutboundAudit({
      userId,
      warehouseId: so.warehouse,
      soId,
      orderNo: so.order_no,
      activityType: "wms.pick_complete",
      payload: { booking_no: booking, tracking: wf.tracking_code },
    });
    return updated;
  }

  if (action === "complete_validate") {
    const err = validateCanAdvanceToPack(wf);
    if (err) throw new Error(err);
    wf = {
      ...wf,
      stage: "validate_done",
      validate: {
        position: opts?.validatePosition ?? wf.validate?.position ?? "A",
        user_id: userId,
        user_name: opts?.userName,
        at: now,
      },
    };
    const updated = await updateSalesOrder(soId, {
      ...base,
      outbound_workflow_json: serializeOutboundWorkflow(wf),
      warehouse_process_status: "processing",
    });
    await logOutboundAudit({
      userId,
      warehouseId: so.warehouse,
      soId,
      orderNo: so.order_no,
      activityType: "wms.validate_complete",
      payload: { position: wf.validate?.position },
    });
    return updated;
  }

  if (action === "complete_pack") {
    if (!isValidateComplete(wf)) {
      throw new Error("Validasi produk belum lengkap.");
    }
    wf = {
      ...wf,
      stage: "pack_done",
      pack: {
        user_id: userId,
        user_name: opts?.userName,
        at: now,
        photo_file_ids: opts?.packPhotoIds ?? [],
        label_attached: true,
      },
    };
    const updated = await updateSalesOrder(soId, {
      ...base,
      outbound_workflow_json: serializeOutboundWorkflow(wf),
      warehouse_process_status: "processing",
    });
    await logOutboundAudit({
      userId,
      warehouseId: so.warehouse,
      soId,
      orderNo: so.order_no,
      activityType: "wms.pack_complete",
      payload: { photos: opts?.packPhotoIds?.length ?? 0 },
    });
    return updated;
  }

  if (action === "complete_pickup") {
    wf = {
      ...wf,
      stage: "pickup_done",
      pickup: opts?.pickup ?? {
        mode: "manual_booking",
        user_id: userId,
        user_name: opts?.userName,
        at: now,
      },
    };
    const updated = await updateSalesOrder(soId, {
      ...base,
      outbound_workflow_json: serializeOutboundWorkflow(wf),
      warehouse_process_status: "complete",
      status: "delivered",
      shipped_date: now.slice(0, 10),
    });
    await logOutboundAudit({
      userId,
      warehouseId: so.warehouse,
      soId,
      orderNo: so.order_no,
      activityType: "wms.pickup_complete",
      payload: wf.pickup,
    });
    return updated;
  }

  throw new Error("Aksi gudang tidak dikenal.");
}

export function salesOrderHoldBlockedInBisnis(
  so: Pick<SalesOrder, "warehouse_process_status" | "warehouse_hold_note">,
): string | null {
  if (so.warehouse_process_status === "hold") {
    return so.warehouse_hold_note
      ? `SO di-hold gudang: ${so.warehouse_hold_note}`
      : "SO di-hold gudang — lanjutkan proses di WMS sebelum buat invoice.";
  }
  return null;
}
