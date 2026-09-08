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

export function isPhysicalHandoverReady(
  checks: PhysicalCheckState,
  scanMatched: boolean,
): boolean {
  return (
    scanMatched &&
    checks.package_count_ok &&
    checks.label_readable &&
    checks.seal_intact
  );
}
