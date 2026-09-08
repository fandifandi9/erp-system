/** Fase workflow retur (WMS dulu → klarifikasi bisnis → settlement → selesai). */
export type ReturWorkflowPhase =
  | "awaiting_wms"
  | "wms_received"
  | "awaiting_business"
  | "awaiting_settlement"
  | "resend"
  | "completed"
  | "cancelled";

/** Putusan bisnis setelah WMS bantah claim. */
export type ReturBusinessResolution = "accept_wms" | "resend";

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

/** Retur di hold WMS: sudah diterima fisik, dibantah, menunggu putusan bisnis. */
export function isReturOnWmsHold(r: {
  type?: string;
  status?: string;
  workflow_phase?: string | null;
  wms_receive_status?: string | null;
  wms_claim_decision?: string | null;
  exception_status?: string | null;
}): boolean {
  if (r.type !== "penjualan") return false;
  if (r.status === "completed" || r.status === "cancelled") return false;
  if (r.workflow_phase === "resend" || r.workflow_phase === "completed") return false;
  if (r.wms_receive_status !== "complete") return false;
  return r.wms_claim_decision === "disagree" || r.exception_status === "open";
}

/** Filter hold — diterima WMS, belum selesai (saring claim di client). */
export function salesReturnsWmsHoldPbFilter(): string {
  return 'type = "penjualan" && status = "draft" && wms_receive_status = "complete"';
}

/** Retur kirim kembali — antrean pickup/pengiriman WMS. */
export function salesReturnsResendPbFilter(): string {
  return 'type = "penjualan" && status = "draft" && workflow_phase = "resend"';
}

export function isReturAwaitingResendPickup(r: {
  type?: string;
  status?: string;
  workflow_phase?: string | null;
  business_resolution?: string | null;
  resend_pickup_no?: string | null;
}): boolean {
  if (r.type !== "penjualan") return false;
  if (r.status !== "draft") return false;
  if (r.workflow_phase !== "resend" && r.business_resolution !== "resend") return false;
  return Boolean(r.resend_pickup_no?.trim());
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
  if (r.workflow_phase === "cancelled" || r.workflow_phase === "resend") return false;
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

/**
 * Status proses retur untuk daftar/detail — hanya 5 label user-facing:
 * Pengiriman · Klarifikasi · Menunggu settlement · Selesai · Dibatalkan
 * Warna dibedakan jelas agar tidak mirip di daftar.
 */
export function returProcessDisplay(retur: {
  status?: string;
  workflow_phase?: string | null;
  wms_receive_status?: string | null;
  exception_status?: string | null;
  wms_claim_decision?: string | null;
  business_resolution?: string | null;
}): { label: string; labelEn: string; cls: string; hint?: string } {
  /** Tolak klaim + sudah diserahkan WMS ke pelanggan. */
  if (
    retur.business_resolution === "resend" &&
    (retur.status === "cancelled" || retur.status === "completed")
  ) {
    return {
      label: "Kirim kembali",
      labelEn: "Resent",
      cls: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300",
      hint: "Sudah diserahkan / dikirim ulang ke pelanggan",
    };
  }
  if (retur.status === "cancelled" || retur.workflow_phase === "cancelled") {
    return {
      label: "Dibatalkan",
      labelEn: "Cancelled",
      cls: "bg-red-100 text-red-800 ring-1 ring-red-200",
    };
  }
  if (retur.workflow_phase === "resend") {
    return {
      label: "Kirim kembali",
      labelEn: "Resend",
      cls: "bg-orange-100 text-orange-900 ring-1 ring-orange-300",
      hint: "Antrean WMS pickup/pengiriman — scan nomor pickup",
    };
  }
  if (retur.status === "completed" || retur.workflow_phase === "completed") {
    return {
      label: "Selesai",
      labelEn: "Completed",
      cls: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
    };
  }
  // Tidak pakai “Menunggu settlement” terpisah — Selesai = stok + pembukuan sekaligus.
  const inClarification =
    retur.exception_status === "open" ||
    retur.wms_claim_decision === "disagree" ||
    retur.workflow_phase === "awaiting_business" ||
    retur.workflow_phase === "wms_received" ||
    retur.workflow_phase === "awaiting_settlement" ||
    retur.wms_receive_status === "complete";
  if (inClarification) {
    const disputed =
      retur.exception_status === "open" || retur.wms_claim_decision === "disagree";
    return {
      label: disputed ? "Hold" : "Klarifikasi",
      labelEn: disputed ? "Hold" : "Clarification",
      cls: disputed
        ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300"
        : "bg-sky-100 text-sky-900 ring-1 ring-sky-300",
      hint: disputed
        ? "WMS hold — menunggu putusan bisnis"
        : "Sudah diterima WMS — bisnis menyelesaikan retur",
    };
  }
  // draft / approved / awaiting_wms → Pengiriman
  return {
    label: "Pengiriman",
    labelEn: "In transit",
    cls: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
    hint: "Barang dikembalikan — menunggu penerimaan gudang",
  };
}

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

  if (phase === "awaiting_settlement") {
    return {
      labelId: "sales.returStatus.awaitingSettlement",
      cls: "bg-violet-100 text-violet-900 ring-1 ring-violet-300",
      returId: retur.id,
      returNo: retur.retur_no,
    };
  }
  if (
    retur.exception_status === "open" ||
    phase === "awaiting_business" ||
    wms === "complete"
  ) {
    return {
      labelId: "sales.returStatus.awaitingBusiness",
      cls: "bg-sky-100 text-sky-900 ring-1 ring-sky-300",
      returId: retur.id,
      returNo: retur.retur_no,
      isException: retur.exception_status === "open",
    };
  }
  return {
    labelId: "sales.returStatus.awaitingWms",
    cls: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
    returId: retur.id,
    returNo: retur.retur_no,
  };
}
