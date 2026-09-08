"use client";

import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { buildWmsOrderHeader } from "@/lib/wms/wms-order-display";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import {
  printHandoverReceiptSmart,
  type HandoverReceiptPrintData,
} from "@/lib/wms/print-handover-receipt";
import { buildTtLineFromSo } from "@/lib/wms/pickup-batch";
import type { TtLineSnapshot } from "@/lib/wms/tt-number";

export type HandoverPrintOverrides = {
  courierName?: string;
  courierPhone?: string;
  courierCompany?: string;
  warehouseStaff?: string;
  ttNo?: string;
  items?: TtLineSnapshot[];
  warehouseName?: string;
};

export async function buildHandoverReceiptPrintData(
  so: SalesOrder,
  overrides?: HandoverPrintOverrides,
): Promise<HandoverReceiptPrintData> {
  const h = buildWmsOrderHeader(so);
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const pickup = wf.pickup;
  const items =
    overrides?.items?.length
      ? overrides.items
      : pickup?.tt_lines?.length
        ? pickup.tt_lines
        : [await buildTtLineFromSo(so, pickup?.physical_scan_code)];

  return {
    ttNo: overrides?.ttNo?.trim() || pickup?.tt_no?.trim() || "—",
    courierCompany:
      overrides?.courierCompany?.trim() ||
      pickup?.courier_company?.trim() ||
      h.courier ||
      "—",
    courierName: overrides?.courierName?.trim() || pickup?.driver_name?.trim() || "—",
    courierPhone: overrides?.courierPhone?.trim() || pickup?.driver_phone?.trim() || undefined,
    warehouseName: overrides?.warehouseName?.trim() || undefined,
    warehouseStaff:
      overrides?.warehouseStaff?.trim() ||
      pickup?.user_name ||
      (typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined),
    items,
  };
}

export async function loadHandoverReceiptPrintData(soId: string): Promise<HandoverReceiptPrintData> {
  const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
    expand: "warehouse,customer,store",
  });
  return buildHandoverReceiptPrintData(so);
}

export async function printHandoverReceiptForOrder(
  soId: string,
  overrides?: HandoverPrintOverrides,
): Promise<void> {
  const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
    expand: "warehouse,customer,store",
  });
  await printHandoverReceiptSmart(await buildHandoverReceiptPrintData(so, overrides));
}

/** Cetak satu TT untuk seluruh batch (satu slip, banyak item). */
export async function printHandoverReceiptBatch(
  data: HandoverReceiptPrintData,
): Promise<void> {
  await printHandoverReceiptSmart(data);
}
