import type PocketBase from "pocketbase";
import {
  isReturAwaitingResendPickup,
  salesReturnsResendPbFilter,
} from "@/lib/bisnis/retur-workflow";
import { resolveProcessActorName } from "@/lib/bisnis/process-actor";
import { BISNIS_COLLECTIONS, type Retur, type ReturLine } from "@/lib/bisnis/types";
import { postOutStockMovementServer } from "@/lib/inventory/auto-stock-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { pb } from "@/lib/pocketbase";
import { normalizeHandoverScanCode } from "@/lib/wms/pickup-handover";
import { normalizePkCompareKey, pkCodeBody } from "@/lib/wms/pk-number";
import {
  parseResendShippingJson,
  resendShippingPayerLabel,
} from "@/lib/bisnis/sales-retur-resend-shipping";

export type ResendPickupQueueItem = {
  retur: Retur;
  pickupNo: string;
  method: "pickup" | "ship";
  customerName: string;
  lineCount: number;
  shippingSummary?: string;
};

function normalizePickupCompare(raw: string): string {
  const n = normalizeHandoverScanCode(raw);
  const body = pkCodeBody(n);
  return normalizePkCompareKey(body || n);
}

export function salesReturnResendScanMatches(retur: Retur, rawScan: string): boolean {
  const pickup = retur.resend_pickup_no?.trim();
  if (!pickup || !rawScan.trim()) return false;
  return normalizePickupCompare(pickup) === normalizePickupCompare(rawScan);
}

/** Cari retur kirim kembali di antrean siap ambil dari scan PK / nomor pickup. */
export async function findResendPickupByScan(
  rawScan: string,
): Promise<ResendPickupQueueItem | null> {
  if (!rawScan.trim()) return null;
  const queue = await loadResendPickupQueue();
  return queue.find((item) => salesReturnResendScanMatches(item.retur, rawScan)) ?? null;
}

/** Antrean kirim kembali di UI pickup (browser PB). */
export async function loadResendPickupQueue(): Promise<ResendPickupQueueItem[]> {
  try {
    const res = await pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, 50, {
      filter: salesReturnsResendPbFilter(),
      expand: "warehouse,customer",
      sort: "-business_process_completed_at,-updated",
      requestKey: null,
    });
    return res.items.filter(isReturAwaitingResendPickup).map((r) => {
      const ship = parseResendShippingJson(r.resend_shipping_json);
      const method = r.resend_method === "ship" ? "ship" : "pickup";
      let shippingSummary: string | undefined;
      if (method === "ship" && ship) {
        shippingSummary = [
          ship.courier,
          ship.shipping_service,
          resendShippingPayerLabel(ship.shipping_payer),
          ship.shipping_cost > 0
            ? `Rp ${ship.shipping_cost.toLocaleString("id-ID")}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
      }
      return {
        retur: r,
        pickupNo: r.resend_pickup_no?.trim() || "",
        method,
        customerName: r.expand?.customer?.name?.trim() || "—",
        lineCount: 0,
        shippingSummary,
      };
    });
  } catch {
    return [];
  }
}

export type CompleteSalesReturnResendInput = {
  returId: string;
  userId: string;
  scannedCode?: string;
  driverName?: string;
  driverPhone?: string;
  courierCompany?: string;
  photoIds?: string[];
};

/**
 * WMS serahkan barang kirim kembali: OUT dari gudang sementara, tutup retur (tolak klaim).
 */
export async function completeSalesReturnResendHandover(
  adminPb: PocketBase,
  input: CompleteSalesReturnResendInput,
): Promise<Retur> {
  const retur = await adminPb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(input.returId);
  if (retur.type !== "penjualan") throw new Error("Hanya retur penjualan.");
  if (retur.status === "completed" || retur.status === "cancelled") {
    throw new Error("Retur sudah ditutup.");
  }
  if (retur.workflow_phase !== "resend" || retur.business_resolution !== "resend") {
    throw new Error("Retur tidak dalam alur kirim kembali.");
  }
  if (retur.wms_receive_status !== "complete") {
    throw new Error("Barang belum pernah diterima WMS.");
  }
  if (!retur.warehouse) {
    throw new Error("Gudang sementara retur tidak terisi.");
  }

  const pickupNo = retur.resend_pickup_no?.trim();
  if (!pickupNo) throw new Error("Nomor pickup kirim kembali belum ada.");

  if (input.scannedCode?.trim()) {
    if (!salesReturnResendScanMatches(retur, input.scannedCode)) {
      throw new Error(`Scan tidak cocok. Harus nomor pickup ${pickupNo}.`);
    }
  }

  const lines = await adminPb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLine>({
    filter: `retur = "${input.returId}"`,
    expand: "product",
    requestKey: null,
  });
  const stockLines = lines
    .map((l) => ({
      product: l.product,
      qty: Number(l.actual_qty ?? l.qty) || 0,
    }))
    .filter((l) => l.product && l.qty > 0);
  if (!stockLines.length) throw new Error("Tidak ada qty untuk dikirim kembali.");

  const { resolveReturnLinesFromSale } = await import("@/lib/catalog/sale-stock-lines");
  const expanded = await resolveReturnLinesFromSale(adminPb, stockLines);

  await postOutStockMovementServer({
    warehouse: retur.warehouse,
    reference_type: "SALES_RETURN_RESEND",
    reference_id: retur.id,
    reference_no: retur.retur_no,
    lines: expanded,
    userId: input.userId,
    noteSuffix: "Kirim kembali ke pelanggan — keluar gudang sementara",
  });

  const now = new Date().toISOString();
  const actor = await resolveProcessActorName(adminPb, input.userId);

  const activities = await adminPb.collection(INV_COLLECTIONS.staffActivities).getFullList({
    filter: `entity_type = "biz_returs" && entity_id = "${input.returId}" && activity_type = "wms.sales_return_resend"`,
    requestKey: null,
  });
  for (const row of activities) {
    const r = row as { id: string; payload?: Record<string, unknown> };
    if (r.payload?.status === "cancelled" || r.payload?.status === "complete") continue;
    try {
      await adminPb.collection(INV_COLLECTIONS.staffActivities).update(r.id, {
        payload: {
          ...(r.payload ?? {}),
          status: "complete",
          completed_by: input.userId,
          completed_at: now,
          scanned_code: input.scannedCode?.trim() || pickupNo,
          driver_name: input.driverName?.trim() || "",
          driver_phone: input.driverPhone?.trim() || "",
          courier_company: input.courierCompany?.trim() || "",
          photo_ids: input.photoIds ?? [],
        },
      });
    } catch {
      /* best effort */
    }
  }

  return adminPb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(input.returId, {
    status: "cancelled",
    workflow_phase: "cancelled",
    exception_status: "resolved",
    stock_posted_at: now,
    reminder_due_at: "",
    completed_at: now,
    wms_processed_by: input.userId,
    wms_processed_by_name: actor,
    wms_process_completed_at: now,
    notes: [retur.notes?.trim(), `Kirim kembali selesai WMS · pickup ${pickupNo}`]
      .filter(Boolean)
      .join("\n"),
  });
}
