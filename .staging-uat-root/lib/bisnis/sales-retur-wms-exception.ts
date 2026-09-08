import type { Retur } from "@/lib/bisnis/types";

export type WmsExceptionSummary = {
  exception_type?: string;
  reasons?: string[];
  recorded_at?: string;
};

export function hasOpenSalesReturWmsException(
  retur: Pick<Retur, "workflow_phase" | "exception_status" | "status">,
): boolean {
  if (retur.status === "completed" || retur.status === "cancelled") return false;
  return retur.exception_status === "open" && retur.workflow_phase === "awaiting_business";
}

export function parseWmsExceptionSummary(raw?: string | null): WmsExceptionSummary | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as WmsExceptionSummary;
  } catch {
    return null;
  }
}

export function salesReturWmsExceptionBadge(
  retur: Pick<Retur, "workflow_phase" | "exception_status" | "status">,
): { label: string; cls: string } | null {
  if (!hasOpenSalesReturWmsException(retur)) return null;
  return {
    label: "WMS Exception",
    cls: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  };
}
