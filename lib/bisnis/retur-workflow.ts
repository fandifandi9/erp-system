/** Fase workflow retur (WMS dulu → klarifikasi bisnis → settlement → selesai). */
export type ReturWorkflowPhase =
  | "awaiting_wms"
  | "wms_received"
  | "awaiting_business"
  | "awaiting_settlement"
  | "completed"
  | "cancelled";

export type PurchaseReceivingBusinessStatus =
  | "pending_wms"
  | "awaiting_business"
  | "resolved";

export const RETUR_REMINDER_DAYS = 3;

export function returAwaitingBusiness(phase?: string | null): boolean {
  return phase === "awaiting_business" || phase === "wms_received";
}

export function returAwaitingSettlement(phase?: string | null): boolean {
  return phase === "awaiting_settlement";
}

export function returAwaitingWms(phase?: string | null, status?: string): boolean {
  if (
    phase === "awaiting_business" ||
    phase === "awaiting_settlement" ||
    phase === "completed" ||
    phase === "cancelled"
  ) {
    return false;
  }
  if (phase === "awaiting_wms") return true;
  return !phase && status === "draft";
}

export function reminderDueAtIso(days = RETUR_REMINDER_DAYS): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Filter PB aman — tanpa workflow_phase (field bisa belum ada di schema). */
export function salesReturnsReceivingPbFilter(): string {
  return (
    'type = "penjualan" && status = "draft" && ' +
    '(wms_receive_status = "pending" || wms_receive_status = "" || wms_receive_status ?= "")'
  );
}

export function purchaseReturnsReceivingPbFilter(): string {
  return (
    'type = "pembelian" && status = "draft" && ' +
    '(wms_receive_status = "pending" || wms_receive_status = "" || wms_receive_status ?= "")'
  );
}

/** Saring client-side setelah fetch (workflow_phase / status WMS). */
export function isReturInWmsInboundQueue(
  r: {
    type?: string;
    status?: string;
    workflow_phase?: string | null;
    wms_receive_status?: string | null;
  },
): boolean {
  if (r.status !== "draft") return false;
  if (r.wms_receive_status === "complete") return false;
  if (r.workflow_phase === "awaiting_business" || r.workflow_phase === "completed") return false;
  if (r.workflow_phase === "cancelled") return false;
  if (r.type === "penjualan" || r.type === "pembelian") {
    return returAwaitingWms(r.workflow_phase, r.status) || r.workflow_phase === "wms_received";
  }
  return false;
}

export type ReturSoDisplayStatus = {
  labelId: string;
  cls: string;
  returId: string;
  returNo: string;
  isException?: boolean;
};

/** Label badge retur terbuka di daftar / detail SO. */
export function returDisplayForSalesOrder(
  retur: {
    id: string;
    retur_no: string;
    workflow_phase?: string | null;
    wms_receive_status?: string | null;
    exception_status?: string | null;
    status?: string;
  },
): ReturSoDisplayStatus {
  const phase = retur.workflow_phase;
  const wms = retur.wms_receive_status;

  if (retur.exception_status === "open" && phase === "awaiting_business") {
    return {
      labelId: "sales.returStatus.wmsException",
      cls: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
      returId: retur.id,
      returNo: retur.retur_no,
      isException: true,
    };
  }
  if (phase === "awaiting_settlement") {
    return {
      labelId: "sales.returStatus.awaitingSettlement",
      cls: "bg-violet-100 text-violet-900",
      returId: retur.id,
      returNo: retur.retur_no,
    };
  }
  if (phase === "awaiting_business" || wms === "complete") {
    return {
      labelId: "sales.returStatus.awaitingBusiness",
      cls: "bg-blue-100 text-blue-800",
      returId: retur.id,
      returNo: retur.retur_no,
    };
  }
  return {
    labelId: "sales.returStatus.awaitingWms",
    cls: "bg-amber-100 text-amber-900",
    returId: retur.id,
    returNo: retur.retur_no,
  };
}
