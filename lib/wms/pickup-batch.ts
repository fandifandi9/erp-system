import type { SalesOrder } from "@/lib/bisnis/types";
import type { TranslateFn } from "@/lib/i18n/wms-formatters";
import type { OutboundWorkflow } from "./outbound-workflow";
import type { PhysicalCheckState } from "./pickup-handover";
import { getAwbTrackingFromOrder } from "@/lib/bisnis/awb-label";
import { getPackageIdentityView, extractAwbFromOrder } from "./package-identity";
import { isSoAwaitingPickup } from "./outbound-queues";
import { normalizeHandoverScanCode } from "./pickup-handover";
import {
  findSalesOrderByPackageLabelScan,
  orderMatchesPackageLabelScan,
} from "./outbound-order-lookup";
import { pickupGateBlocksHandover } from "./awb-pickup-gate";
import { getPkFromSo, getPkIdentityView, orderMatchesPkScan } from "./pk-identity";
import { normalizePkCompareKey, pkCodeBody } from "./pk-number";
import { buildWmsOrderHeader, resolveInvoiceNoForSo } from "./wms-order-display";
import { parseOutboundWorkflow } from "./outbound-workflow";
import type { TtLineSnapshot } from "./tt-number";
import { isWmsPickupFulfillment } from "./fulfillment-mode";

export type PickupBatchItem = {
  so: SalesOrder;
  /** AWB aktif di sistem (identitas utama ekspedisi). */
  awb: string;
  /** Kode label yang discan (AWB atau PK). */
  scannedAwb: string;
  recordedAt: string;
  orderNo: string;
  /** Nomor invoice (bukan SO). "—" jika belum ada. */
  invoiceNo: string;
  storeName: string;
};

export async function buildPickupBatchItem(
  so: SalesOrder,
  scannedAwb: string,
): Promise<PickupBatchItem> {
  const pkg = getPackageIdentityView(so);
  const awb = pkg.type === "awb" && pkg.code !== "—" ? pkg.code : pkg.code;
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const storeName =
    wf.order_meta?.store_name?.trim() ||
    so.expand?.store?.name?.trim() ||
    "—";
  const invoiceNo = await resolveInvoiceNoForSo(so);
  return {
    so,
    awb,
    scannedAwb: normalizeHandoverScanCode(scannedAwb),
    recordedAt: new Date().toISOString(),
    orderNo: so.order_no,
    invoiceNo,
    storeName,
  };
}

export async function buildTtLineFromSo(
  so: SalesOrder,
  scannedAwb?: string,
  invoiceNoHint?: string,
): Promise<TtLineSnapshot> {
  const h = buildWmsOrderHeader(so);
  const pk = getPkIdentityView(so);
  const scanned = scannedAwb?.trim() ? normalizeHandoverScanCode(scannedAwb) : "";
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const storeName =
    wf.order_meta?.store_name?.trim() ||
    so.expand?.store?.name?.trim() ||
    undefined;

  const pkFromScan = scanned && orderMatchesPkScan(so, scanned) ? pkCodeBody(scanned) : "";
  const pkStored = pk.pkNo !== "—" ? pk.pkNo : "";
  const usePk =
    !!pkFromScan ||
    isWmsPickupFulfillment(so) ||
    (!!scanned && !!pkStored && normalizePkCompareKey(scanned) === normalizePkCompareKey(pkStored));

  const invoiceNo =
    (invoiceNoHint?.trim() && invoiceNoHint !== "—" ? invoiceNoHint.trim() : "") ||
    (await resolveInvoiceNoForSo(so));

  // Ambil sendiri / scan label PK → nomor PK (+ toko).
  if (usePk) {
    const pkNo = pkFromScan || pkStored || (scanned ? pkCodeBody(scanned) : "");
    return {
      so_id: so.id,
      order_no: h.orderNo,
      invoice_no: invoiceNo,
      awb: "—",
      pk_no: pkNo || undefined,
      store_name: storeName || "—",
    };
  }

  // Dikirim → nomor AWB (+ toko). Jangan pakai nomor PK sebagai AWB.
  const pkg = getPackageIdentityView(so);
  const candidates = [
    scanned,
    pkg.type === "awb" && pkg.code !== "—" ? pkg.code : "",
    extractAwbFromOrder(so)?.trim() || "",
    getAwbTrackingFromOrder(so)?.trim() || "",
  ].filter(Boolean) as string[];

  let awb = "";
  for (const c of candidates) {
    if (pkStored && normalizePkCompareKey(c) === normalizePkCompareKey(pkStored)) continue;
    awb = c;
    break;
  }

  // Fallback: kalau AWB belum ada tapi ada PK, tetap tampilkan PK (jangan slip kosong).
  if (!awb && pkStored) {
    return {
      so_id: so.id,
      order_no: h.orderNo,
      invoice_no: invoiceNo,
      awb: "—",
      pk_no: pkStored,
      store_name: storeName || "—",
    };
  }

  return {
    so_id: so.id,
    invoice_no: invoiceNo,
    order_no: h.orderNo,
    awb: awb || "—",
    pk_no: undefined,
    store_name: storeName || "—",
  };
}

export function canAddToPickupBatch(so: SalesOrder): boolean {
  return isSoAwaitingPickup(so);
}

function scanMatchesOrderLabel(so: SalesOrder, scanned: string): boolean {
  // Selalu izinkan cocok PK (ambil sendiri / label PK), termasuk legacy "PK"+body.
  if (orderMatchesPkScan(so, scanned)) return true;
  if (isWmsPickupFulfillment(so)) return false;
  const pk = getPkFromSo(so);
  const awb =
    extractAwbFromOrder(so)?.trim() || getAwbTrackingFromOrder(so)?.trim() || "";
  if (!awb) return false;
  if (pk && normalizePkCompareKey(awb) === normalizePkCompareKey(pk)) return false;
  return orderMatchesPackageLabelScan(so, scanned);
}

/**
 * Multi-scan Ready Pickup: hanya barcode label PK atau AWB pada paket.
 * @param knownOrders antrean lokal (sudah expand store) — dipakai dulu agar toko/INV akurat.
 */
export async function recordPickupBatchScan(
  rawScan: string,
  existing: PickupBatchItem[],
  t: TranslateFn,
  knownOrders?: SalesOrder[],
): Promise<{ items: PickupBatchItem[]; message: string }> {
  const scanned = normalizeHandoverScanCode(rawScan);
  if (!scanned) {
    throw new Error(t("wms.batch.errEmptyLabel"));
  }

  const fromQueue =
    knownOrders?.find(
      (o) => orderMatchesPackageLabelScan(o, scanned) || orderMatchesPkScan(o, scanned),
    ) ?? null;

  const row =
    fromQueue ??
    (await findSalesOrderByPackageLabelScan(scanned, { onlyAwaitingPickup: true }));
  if (!row) {
    throw new Error(t("wms.batch.errNotFoundLabel", { code: scanned }));
  }
  if (!canAddToPickupBatch(row)) {
    throw new Error(t("wms.batch.errNotReady", { awb: scanned, order: row.order_no }));
  }
  if (!scanMatchesOrderLabel(row, scanned)) {
    throw new Error(t("wms.batch.errLabelMismatch", { code: scanned, order: row.order_no }));
  }
  if (pickupGateBlocksHandover(row)) {
    throw new Error(t("wms.pickup.errBatchOrderAwaitingAwb", { order: row.order_no }));
  }

  const dup = existing.find((b) => b.so.id === row.id);
  if (dup) {
    return {
      items: existing,
      message: t("wms.batch.alreadyRecorded", { awb: scanned, order: row.order_no }),
    };
  }

  const item = await buildPickupBatchItem(row, scanned);
  return {
    items: [...existing, item],
    message: t("wms.batch.recorded", { awb: scanned, order: row.order_no }),
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
  ttNo?: string;
  ttLines?: TtLineSnapshot[];
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
    tt_no: input.ttNo,
    tt_lines: input.ttLines,
  };
}
