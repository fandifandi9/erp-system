import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { getAwbTrackingFromOrder } from "@/lib/bisnis/awb-label";
import { parseOutboundWorkflow } from "./outbound-workflow";
import {
  extractAwbFromOrder,
  getPackageIdentityView,
  parsePackageScanPayload,
} from "./package-identity";
import { getPkFromSo } from "./pk-identity";
import {
  formatPkDisplay,
  normalizePkCompareKey,
  parsePkScanPayload,
  pkCodeBody,
  pkSearchVariants,
} from "./pk-number";
import { isWmsPickupFulfillment } from "./fulfillment-mode";

/** Normalisasi kode scan: trim, rapikan spasi. AWB bisa mempertahankan casing asli. */
export function normalizeScanRef(raw: string): string {
  const parsed = parsePackageScanPayload(raw);
  if (!parsed) return "";
  return parsed.trim().replace(/\s+/g, " ");
}

function scanRefsMatch(candidate: string, scan: string): boolean {
  const c = candidate.trim().replace(/\s+/g, " ");
  const s = scan.trim().replace(/\s+/g, " ");
  if (!c || !s) return false;
  if (c === s) return true;
  if (c.toUpperCase() === s.toUpperCase()) return true;
  // PK: banding badan nomor (PKSA9PY4ZR ≡ pksa9py4zr ≡ SA9PY4ZR).
  if (normalizePkCompareKey(c) === normalizePkCompareKey(s)) return true;
  return false;
}

function isSameAsPk(code: string, pk: string | null): boolean {
  if (!pk) return false;
  return (
    normalizePkCompareKey(code) === normalizePkCompareKey(pk) ||
    formatPkDisplay(code) === formatPkDisplay(pk) ||
    code.trim() === pk.trim()
  );
}

/** Hanya kode pada label fisik: PK (ambil sendiri) atau AWB (dikirim). */
export function getPackageLabelScanCandidates(so: SalesOrder): string[] {
  const refs = new Set<string>();
  const pk = getPkFromSo(so);
  if (pk) {
    refs.add(pk);
    refs.add(formatPkDisplay(pk));
    const body = pkCodeBody(pk);
    if (body && body !== "—") {
      refs.add(body);
      refs.add(`PK${body}`);
    }
  }

  if (!isWmsPickupFulfillment(so)) {
    const wf = parseOutboundWorkflow(so.outbound_workflow_json);
    for (const c of [extractAwbFromOrder(so, wf), getAwbTrackingFromOrder(so)]) {
      const t = c?.trim();
      if (!t || isSameAsPk(t, pk)) continue;
      refs.add(t);
    }
    const view = getPackageIdentityView(so, wf);
    if (view.type === "awb" && view.code && view.code !== "—" && !isSameAsPk(view.code, pk)) {
      refs.add(view.code);
    }
  }

  return [...refs];
}

export function orderMatchesPackageLabelScan(so: SalesOrder, rawScan: string): boolean {
  const scan = normalizeScanRef(rawScan);
  if (!scan) return false;
  return getPackageLabelScanCandidates(so).some((c) => scanRefsMatch(c, scan));
}

/** Referensi untuk scan umum (validasi, dll): Package Code + PK + order. */
export function getOrderScanCandidates(so: SalesOrder): string[] {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const view = getPackageIdentityView(so, wf);
  const refs = new Set<string>();
  const pk = getPkFromSo(so);
  if (pk) {
    refs.add(pk);
    refs.add(formatPkDisplay(pk));
  }
  if (view.code && view.code !== "—") refs.add(view.code);
  for (const h of view.internalHistory) {
    if (h?.trim()) refs.add(h.trim());
  }
  refs.add(so.order_no);
  return [...refs];
}

export function orderMatchesScanRef(so: SalesOrder, rawScan: string): boolean {
  const scan = normalizeScanRef(rawScan);
  if (!scan) return false;
  return getOrderScanCandidates(so).some((c) => scanRefsMatch(c, scan));
}

/**
 * Ready Pickup: cari SO hanya lewat barcode label PK atau AWB (bukan nomor SO).
 */
export async function findSalesOrderByPackageLabelScan(
  code: string,
  opts?: { onlyAwaitingPickup?: boolean },
): Promise<SalesOrder | null> {
  const raw = normalizeScanRef(code);
  if (!raw) return null;

  const pkParsed = parsePkScanPayload(raw);
  const variants = [...new Set([...pkSearchVariants(raw), ...(pkParsed ? pkSearchVariants(pkParsed) : [])])];

  try {
    const pkFilters = variants
      .map((v) => {
        const esc = v.replace(/"/g, '\\"');
        return `pk_no = "${esc}" || wms_booking_no = "${esc}"`;
      })
      .join(" || ");
    if (pkFilters) {
      const direct = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 5, {
        filter: `(${pkFilters})`,
        expand: "warehouse,customer,store",
        requestKey: null,
      });
      for (const row of direct.items) {
        if (orderMatchesPackageLabelScan(row, raw)) return row;
      }
    }
  } catch {
    /* field WMS mungkin belum ada */
  }

  const res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 200, {
    filter:
      'send_to_warehouse_at != "" && status != "cancelled" && status != "delivered" && warehouse_process_status != "complete"',
    sort: "-updated",
    expand: "warehouse,customer,store",
    requestKey: null,
  });

  let candidates = res.items;
  if (opts?.onlyAwaitingPickup) {
    const { isSoAwaitingPickup } = await import("./outbound-queues");
    candidates = candidates.filter(isSoAwaitingPickup);
  }

  return candidates.find((o) => orderMatchesPackageLabelScan(o, raw)) ?? null;
}

/**
 * Cari SO outbound by Package Code (AWB atau internal), atau nomor order.
 */
export async function findSalesOrderByScanRef(
  code: string,
  opts?: { onlyAwaitingValidation?: boolean },
): Promise<SalesOrder | null> {
  const raw = normalizeScanRef(code);
  if (!raw) return null;

  const pkParsed = parsePkScanPayload(raw);
  const variants = [...new Set([...pkSearchVariants(raw), ...(pkParsed ? pkSearchVariants(pkParsed) : [])])];

  try {
    const pkFilters = variants
      .map((v) => {
        const esc = v.replace(/"/g, '\\"');
        return `pk_no = "${esc}" || wms_booking_no = "${esc}"`;
      })
      .join(" || ");
    const orderEsc = raw.replace(/"/g, '\\"');
    const orderUpper = raw.toUpperCase();
    const direct = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 1, {
      filter:
        (pkFilters ? `(${pkFilters}) || ` : "") +
        `order_no = "${orderEsc}" || order_no = "${orderUpper}"`,
      expand: "warehouse,customer,store",
      requestKey: null,
    });
    if (direct.items.length > 0) return direct.items[0];
  } catch {
    /* field WMS mungkin belum ada */
  }

  const res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 100, {
    filter: 'send_to_warehouse_at != "" && status != "cancelled" && status != "delivered"',
    sort: "-created",
    expand: "warehouse,customer,store",
    requestKey: null,
  });

  let candidates = res.items;
  if (opts?.onlyAwaitingValidation) {
    const { isSoAwaitingValidation } = await import("./outbound-queues");
    candidates = candidates.filter(isSoAwaitingValidation);
  }

  return candidates.find((o) => orderMatchesScanRef(o, raw)) ?? null;
}
