import type { SalesOrder } from "@/lib/bisnis/types";
import { orderMatchesScanRef, normalizeScanRef } from "./outbound-order-lookup";

export type PhysicalCheckState = {
  package_count_ok: boolean;
  label_readable: boolean;
  seal_intact: boolean;
};

export function normalizeHandoverScanCode(raw: string): string {
  return normalizeScanRef(raw);
}

/** Cocokkan scan fisik dengan booking / order / AWB di sistem. */
export function matchHandoverScanToOrder(so: SalesOrder, rawScan: string): boolean {
  return orderMatchesScanRef(so, rawScan);
}

/** Siap serah terima: cukup AWB sudah discan (checklist fisik tidak dipakai). */
export function isPhysicalHandoverReady(
  _checks: PhysicalCheckState | undefined,
  scanMatched: boolean,
): boolean {
  return scanMatched;
}

/** Checklist otomatis lulus — disimpan di payload untuk kompatibilitas audit. */
export function autoPhysicalChecks(): PhysicalCheckState {
  return {
    package_count_ok: true,
    label_readable: true,
    seal_intact: true,
  };
}
