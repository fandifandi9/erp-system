import type { SalesOrder } from "@/lib/bisnis/types";
import type { TranslateFn } from "@/lib/i18n/wms-formatters";
import type { OutboundWorkflow } from "./outbound-workflow";
import type { PhysicalCheckState } from "./pickup-handover";
import { getPackageIdentityView } from "./package-identity";
import { isSoAwaitingPickup } from "./outbound-queues";
import { normalizeHandoverScanCode } from "./pickup-handover";
import { findSalesOrderByScanRef } from "./outbound-order-lookup";

export type PickupBatchItem = {
  so: SalesOrder;
  /** AWB aktif di sistem (identitas utama ekspedisi). */
  awb: string;
  /** AWB yang discan operator — pencatatan serah terima. */
  scannedAwb: string;
  recordedAt: string;
  orderNo: string;
};

export function buildPickupBatchItem(so: SalesOrder, scannedAwb: string): PickupBatchItem {
  const pkg = getPackageIdentityView(so);
  const awb = pkg.type === "awb" && pkg.code !== "—" ? pkg.code : pkg.code;
  return {
    so,
    awb,
    scannedAwb: normalizeHandoverScanCode(scannedAwb),
    recordedAt: new Date().toISOString(),
    orderNo: so.order_no,
  };
}

export function canAddToPickupBatch(so: SalesOrder): boolean {
  return isSoAwaitingPickup(so);
}

/**
 * Multi-scan: setiap scan hanya mencatat nomor AWB yang discan.
 * Cari order di antrean pickup; tidak perlu verifikasi ulang.
 */
export async function recordPickupBatchScan(
  rawScan: string,
  existing: PickupBatchItem[],
  t: TranslateFn,
): Promise<{ items: PickupBatchItem[]; message: string }> {
  const scannedAwb = normalizeHandoverScanCode(rawScan);
  if (!scannedAwb) {
    throw new Error(t("wms.batch.errEmptyAwb"));
  }

  const row = await findSalesOrderByScanRef(scannedAwb);
  if (!row) {
    throw new Error(t("wms.batch.errNotFound", { awb: scannedAwb }));
  }
  if (!canAddToPickupBatch(row)) {
    throw new Error(t("wms.batch.errNotReady", { awb: scannedAwb, order: row.order_no }));
  }

  const dup = existing.find((b) => b.so.id === row.id);
  if (dup) {
    return {
      items: existing,
      message: t("wms.batch.alreadyRecorded", { awb: scannedAwb, order: row.order_no }),
    };
  }

  const item = buildPickupBatchItem(row, scannedAwb);
  return {
    items: [...existing, item],
    message: t("wms.batch.recorded", { awb: scannedAwb, order: row.order_no }),
  };
}

export function removePickupBatchItem(existing: PickupBatchItem[], soId: string): PickupBatchItem[] {
  return existing.filter((b) => b.so.id !== soId);
}

export function isPickupBatchReady(items: PickupBatchItem[]): boolean {
  return items.length > 0 && items.every((b) => b.scannedAwb.trim().length > 0);
}

export function createPickupBatchId(): string {
  return `batch-${Date.now().toString(36)}`;
}

export type SharedPickupPayloadInput = {
  mode: "scan_label" | "manual_booking";
  userId: string;
  userName?: string;
  driverName?: string;
  driverPhone?: string;
  courierCompany?: string;
  photoIds?: string[];
  physicalChecks?: PhysicalCheckState;
  batchId?: string;
  batchSize?: number;
  scannedAwb?: string;
  recordedAwbs?: string[];
};

/** Payload serah terima kurir — dipakai single & batch pickup. */
export function buildSharedPickupPayload(
  input: SharedPickupPayloadInput,
): NonNullable<OutboundWorkflow["pickup"]> {
  const now = new Date().toISOString();
  return {
    mode: input.mode,
    user_id: input.userId,
    user_name: input.userName,
    at: now,
    driver_name: input.driverName,
    driver_phone: input.driverPhone,
    courier_company: input.courierCompany,
    photo_file_ids: input.photoIds?.length ? input.photoIds : undefined,
    physical_scan_code: input.scannedAwb,
    physical_verified_at: input.scannedAwb ? now : undefined,
    physical_checks: input.physicalChecks,
    batch_id: input.batchId,
    batch_size: input.batchSize,
    recorded_awbs: input.recordedAwbs,
  };
}
