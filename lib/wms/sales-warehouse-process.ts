import {
  fetchSalesOrder,
  fetchSalesOrderLines,
  updateSalesOrder,
} from "@/lib/bisnis/client";
import type { SalesOrder } from "@/lib/bisnis/types";
import { pb } from "@/lib/pocketbase";
import {
  canCancelFromPicking,
  canCancelFromValidatePack,
  isPickComplete,
  isValidateComplete,
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  type OutboundWorkflow,
} from "./outbound-workflow";
import { mergeOutboundLinesFromSoExpanded } from "./outbound-bundle-expand";
import type { WmsWorkstation } from "./workstations";
import { getPackageIdentityView, resolveAndAssignPackageIdentity } from "./package-identity";
import { logOutboundAudit } from "./outbound-audit";
import { getPkFromSo } from "./pk-identity";
import { formatPkDisplay, buildPkQrPayload } from "./pk-number";
import { isPickSerialsComplete, syncSerialsToOrderLines, fetchRequiresSerialMap } from "./serial-numbers";
import { WMS_PACK_PHOTO_MAX } from "./wms-media-limits";
import { computePickupGate, pickupGateBlocksHandover } from "./awb-pickup-gate";
import type { WmsOrderStage } from "./outbound-workflow";

function withStage(wf: OutboundWorkflow, stage: WmsOrderStage, now: string): OutboundWorkflow {
  return { ...wf, stage, stage_entered_at: now };
}

export type SalesWarehouseAction =
  | "hold"
  | "release_hold"
  | "start_picking"
  | "complete_pick"
  | "complete_validate_pack"
  | "complete_pickup"
  | "cancel_order"
  | "validation_failed"
  | "return_to_picking"
  | "cancel_shipment";

export async function updateSalesWarehouseProcess(
  soId: string,
  userId: string,
  action: SalesWarehouseAction,
  opts?: {
    note?: string;
    userName?: string;
    workstation?: WmsWorkstation | null;
    workstationSessionId?: string;
    validatorRole?: string;
    validateStartedAt?: string;
    packing?: NonNullable<OutboundWorkflow["validate_pack"]>["packing"];
    packageCodeVerified?: boolean;
    bookingNo?: string;
    trackingCode?: string;
    entryMode?: "manual" | "tracking_scan";
    pickup?: OutboundWorkflow["pickup"];
    packPhotoIds?: string[];
    labelPhotoIds?: string[];
  },
): Promise<SalesOrder> {
  const so = await fetchSalesOrder(soId);
  if (!so.send_to_warehouse_at) {
    throw new Error("Order belum masuk antrean WMS.");
  }

  const now = new Date().toISOString();
  const lines = await fetchSalesOrderLines(soId);
  let wf = await mergeOutboundLinesFromSoExpanded(
    pb,
    parseOutboundWorkflow(so.outbound_workflow_json),
    lines,
  );

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

  if (action === "start_picking") {
    if (!canCancelFromPicking(wf.stage) && wf.stage !== "picking") {
      /* sudah lewat picking */
    }
    const assigned = await resolveAndAssignPackageIdentity(so, wf);
    const existingPk = getPkFromSo(so);
    const pkNo = existingPk
      ? formatPkDisplay(existingPk)
      : formatPkDisplay(so.order_no?.trim() || "");
    if (!pkNo || pkNo === "—") {
      throw new Error("Nomor PK / pesanan belum tersedia pada SO.");
    }
    const alreadyPicking = assigned.workflow.stage === "picking";
    wf = {
      ...(alreadyPicking && assigned.workflow.stage_entered_at
        ? assigned.workflow
        : withStage(assigned.workflow, "picking", now)),
      pk_no: pkNo,
      pk_qr_payload: buildPkQrPayload(pkNo),
      pk_assigned_at: now,
      pick: {
        ...assigned.workflow.pick!,
        user_id: userId,
        user_name: opts?.userName,
        started_at: assigned.workflow.pick?.started_at || now,
        warehouse_id: so.warehouse,
      },
    };
    return updateSalesOrder(soId, {
      ...base,
      outbound_workflow_json: serializeOutboundWorkflow(wf),
      pk_no: pkNo,
      wms_booking_no: pkNo,
      warehouse_process_status: "checking",
    });
  }

  if (action === "cancel_order") {
    if (!canCancelFromPicking(wf.stage) && !canCancelFromValidatePack(wf.stage)) {
      throw new Error("Order tidak bisa dibatalkan pada tahap ini.");
    }
    wf = {
      ...withStage(wf, "cancelled", now),
      cancel_reason: opts?.note?.trim() || "Dibatalkan",
    };
    const updated = await updateSalesOrder(soId, {
      ...base,
      outbound_workflow_json: serializeOutboundWorkflow(wf),
      warehouse_process_status: "hold",
      status: "cancelled",
      warehouse_hold_note: opts?.note?.trim() || "",
    });
    await logOutboundAudit({
      userId,
      warehouseId: so.warehouse,
      soId,
      orderNo: so.order_no,
      activityType: "wms.order_cancelled",
      payload: { reason: opts?.note },
    });
    return updated;
  }

  if (action === "validation_failed") {
    if (!canCancelFromValidatePack(wf.stage)) {
      throw new Error("Validation Failed hanya untuk tahap Validation & Packing.");
    }
    wf = {
      ...withStage(wf, "validation_failed", now),
      validation_fail_reason: opts?.note?.trim() || "Validasi gagal",
    };
    const updated = await updateSalesOrder(soId, {
      ...base,
      outbound_workflow_json: serializeOutboundWorkflow(wf),
    });
    await logOutboundAudit({
      userId,
      warehouseId: so.warehouse,
      soId,
      orderNo: so.order_no,
      activityType: "wms.validation_failed",
      payload: { reason: opts?.note },
    });
    return updated;
  }

  if (action === "return_to_picking") {
    if (wf.stage !== "validation_failed" && wf.stage !== "validate_pack") {
      throw new Error("Return to Picking tidak tersedia pada tahap ini.");
    }
    wf = {
      ...withStage(wf, "picking", now),
      validation_fail_reason: undefined,
      pick: {
        ...wf.pick!,
        user_id: userId,
        user_name: opts?.userName,
        started_at: now,
        completed_at: "",
      },
    };
    const updated = await updateSalesOrder(soId, {
      ...base,
      outbound_workflow_json: serializeOutboundWorkflow(wf),
      warehouse_process_status: "checking",
    });
    await logOutboundAudit({
      userId,
      warehouseId: so.warehouse,
      soId,
      orderNo: so.order_no,
      activityType: "wms.return_to_picking",
      payload: {},
    });
    return updated;
  }

  if (action === "cancel_shipment") {
    if (wf.stage !== "ready_pickup") {
      throw new Error("Cancel Shipment hanya untuk tahap Ready To Pickup.");
    }
    wf = {
      ...withStage(wf, "validate_pack", now),
      pickup: undefined,
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
      activityType: "wms.cancel_shipment",
      payload: { note: opts?.note },
    });
    return updated;
  }

  if (action === "complete_pick") {
    if (!isPickComplete(wf)) {
      throw new Error("Picking belum lengkap — scan semua produk sesuai jumlah order.");
    }
    const productIds = lines.map((l) => l.product).filter(Boolean);
    const requiresMap = await fetchRequiresSerialMap(productIds);
    if (!isPickSerialsComplete(wf, requiresMap)) {
      throw new Error("Serial number belum lengkap untuk produk wajib SN.");
    }
    const pkNo = getPkFromSo(so) ?? wf.pk_no?.trim();
    if (!pkNo) {
      throw new Error("Nomor PK belum tersedia — buka order picking ulang.");
    }
    await syncSerialsToOrderLines(soId, wf);
    wf = {
      ...withStage(wf, "validate_pack", now),
      entry_mode: opts?.entryMode ?? wf.entry_mode,
      pick: {
        ...wf.pick!,
        user_id: userId,
        user_name: opts?.userName,
        completed_at: now,
        lines: wf.pick?.lines ?? {},
      },
    };
    const updated = await updateSalesOrder(soId, {
      ...base,
      pk_no: pkNo,
      wms_booking_no: pkNo,
      outbound_workflow_json: serializeOutboundWorkflow(wf),
      warehouse_process_status: "checking",
    });
    await logOutboundAudit({
      userId,
      warehouseId: so.warehouse,
      soId,
      orderNo: so.order_no,
      activityType: "wms.pick_complete",
      payload: {
        pk_no: pkNo,
        picker: opts?.userName,
        completed_at: now,
      },
    });
    return updated;
  }

  if (action === "complete_validate_pack") {
    if (!isValidateComplete(wf)) {
      throw new Error("Validasi belum lengkap — scan semua SKU.");
    }
    if (!opts?.packPhotoIds?.length) {
      throw new Error("Minimal 1 foto paket wajib diunggah.");
    }
    if (opts.packPhotoIds.length > WMS_PACK_PHOTO_MAX) {
      throw new Error(`Maksimal ${WMS_PACK_PHOTO_MAX} foto packing per order.`);
    }
    if (!opts?.packageCodeVerified) {
      throw new Error("Scan Package Code belum cocok dengan order ini.");
    }
    const ws = opts.workstation;
    const prevVp = wf.validate_pack;
    wf = {
      ...withStage(wf, "ready_pickup", now),
      pickup_gate: computePickupGate(so),
      validate_pack: {
        ...prevVp,
        user_id: userId,
        user_name: opts?.userName,
        user_role: opts?.validatorRole ?? prevVp?.user_role,
        started_at: opts?.validateStartedAt ?? prevVp?.started_at ?? now,
        completed_at: now,
        workstation_id: ws?.id ?? prevVp?.workstation_id,
        workstation_code: ws?.code ?? prevVp?.workstation_code,
        workstation_name: ws?.name ?? prevVp?.workstation_name,
        workstation_location: ws?.location ?? prevVp?.workstation_location,
        workstation_cctv: ws?.cctv ?? prevVp?.workstation_cctv,
        cctv_no: ws?.cctv ?? prevVp?.cctv_no,
        workstation_session_id:
          opts?.workstationSessionId ?? prevVp?.workstation_session_id,
        package_code_verified: true,
        package_code_verified_at: now,
        packing: opts.packing,
        label_attached: true,
        pack_photo_ids: opts.packPhotoIds,
        label_photo_ids: opts.labelPhotoIds,
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
      activityType: "wms.validate_pack_complete",
      payload: {
        validator: opts?.userName,
        validator_role: opts?.validatorRole,
        workstation: ws?.code,
        cctv: ws?.cctv,
        workstation_session_id: opts?.workstationSessionId,
        packing: opts.packing,
        package_code: wf.package_code,
        started_at: wf.validate_pack?.started_at,
        completed_at: now,
      },
    });
    return updated;
  }

  if (action === "complete_pickup") {
    if (pickupGateBlocksHandover(so, wf)) {
      throw new Error(
        "Order menunggu label AWB — unggah di penjualan atau halaman pickup sebelum serah terima.",
      );
    }
    wf = {
      ...withStage(wf, "completed", now),
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
      payload: (wf.pickup ?? {}) as Record<string, unknown>,
    });

    const { autoCreateInvoiceAfterWmsComplete } = await import("@/lib/bisnis/wms-doc-auto");
    await autoCreateInvoiceAfterWmsComplete(soId, userId);

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
