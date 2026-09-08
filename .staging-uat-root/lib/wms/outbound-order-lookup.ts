import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { parseOutboundWorkflow } from "./outbound-workflow";
import {
  getPackageIdentityView,
  parsePackageScanPayload,
} from "./package-identity";
import { getPkFromSo } from "./pk-identity";
import { formatPkDisplay, parsePkScanPayload, pkSearchVariants } from "./pk-number";

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
  return false;
}

/** Referensi untuk scan: Package Code aktif + riwayat internal. */
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
      expand: "warehouse,customer",
      requestKey: null,
    });
    if (direct.items.length > 0) return direct.items[0];
  } catch {
    /* field WMS mungkin belum ada */
  }

  const res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 100, {
    filter: 'send_to_warehouse_at != "" && status != "cancelled" && status != "delivered"',
    sort: "-created",
    expand: "warehouse,customer",
    requestKey: null,
  });

  let candidates = res.items;
  if (opts?.onlyAwaitingValidation) {
    const { isSoAwaitingValidation } = await import("./outbound-queues");
    candidates = candidates.filter(isSoAwaitingValidation);
  }

  return candidates.find((o) => orderMatchesScanRef(o, raw)) ?? null;
}
