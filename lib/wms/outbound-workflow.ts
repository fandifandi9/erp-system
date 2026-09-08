import type { SalesOrder, SalesOrderLine } from "@/lib/bisnis/types";

/**
 * Status WMS operasional (SERBA).
 * New Order → Picking → Validation & Packing → Ready To Pickup → Completed
 * Exception: cancelled | validation_failed
 */
export type WmsOrderStage =
  | "new_order"
  | "picking"
  | "validate_pack"
  | "ready_pickup"
  | "completed"
  | "cancelled"
  | "validation_failed";

/** @deprecated Gunakan WmsOrderStage — alias kompatibilitas */
export type OutboundStage = WmsOrderStage;

export type ValidatePosition = "A" | "B" | "C";

export type OutboundLineState = {
  product_id: string;
  sku?: string;
  name?: string;
  qty_required: number;
  qty_picked: number;
  qty_validated: number;
  /** Serial number per unit (produk wajib SN). */
  serial_numbers?: string[];
  /** Komponen untuk bundle — metadata tampilan gudang. */
  for_bundle_product_id?: string;
  for_bundle_label?: string;
};

export type PackageIdentityType = "awb" | "internal";

export type PackageIdentityState = {
  type: PackageIdentityType;
  code: string;
  awb?: string;
  internal_package_code?: string;
  internal_code_history?: string[];
  assigned_at?: string;
};

export type OutboundOrderMeta = {
  order_no: string;
  invoice_no?: string;
  /** @deprecated — gunakan package_code */
  tracking_no?: string;
  /** @deprecated — gunakan package_code */
  booking_no?: string;
  package_code?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  store_id?: string;
  store_name?: string;
  customer_name?: string;
  courier?: string;
  shipping_service?: string;
  recipient_address?: string;
  shipping_cost?: number;
};

export type OutboundWorkflow = {
  stage: WmsOrderStage;
  /** Waktu masuk tahap saat ini — untuk hitung "X menit yang lalu" per tahap. */
  stage_entered_at?: string;
  /** Gate serah terima kurir saat stage ready_pickup */
  pickup_gate?: "menunggu_awb" | "siap_serah";
  /**
   * Permintaan dari meja tablet depan gudang (ambil sendiri / ojol).
   * Gudang siapkan PK lalu serahkan di multi-scan / meja.
   */
  desk_request?: {
    status: "pending" | "fulfilled";
    at: string;
    requester_name: string;
    requester_phone?: string;
    photo_file_ids?: string[];
    pk_no?: string;
    user_id?: string;
  };
  /** Nomor picking kit — 5 digit (00001) */
  pk_no?: string;
  pk_qr_payload?: string;
  pk_assigned_at?: string;
  /** Notifikasi email nomor PK ke pelanggan (ambil sendiri). */
  pk_email?: {
    last_sent_at?: string;
    send_count?: number;
    last_to?: string;
    last_error?: string;
  };
  /** Waktu slip PK dicetak (auto/manual) — untuk indikator "sudah dicetak". */
  pk_printed_at?: string;
  entry_mode?: "manual" | "tracking_scan";
  /** @deprecated — identitas aktif di package_code */
  tracking_code?: string;
  /** @deprecated */
  booking_no?: string;
  /** @deprecated — gunakan package_qr_payload */
  booking_qr_payload?: string;
  /** Identitas paket tunggal (AWB atau internal 8 digit). */
  package_identity?: PackageIdentityState;
  package_code?: string;
  package_qr_payload?: string;
  order_meta?: OutboundOrderMeta;
  cancel_reason?: string;
  validation_fail_reason?: string;
  pick?: {
    user_id: string;
    user_name?: string;
    started_at?: string;
    completed_at?: string;
    warehouse_id?: string;
    lines: Record<string, OutboundLineState>;
  };
  validate_pack?: {
    /** @deprecated — diganti workstation */
    position?: ValidatePosition;
    user_id: string;
    user_name?: string;
    user_role?: string;
    started_at?: string;
    completed_at?: string;
    /** @deprecated — gunakan workstation_cctv */
    cctv_no?: string;
    workstation_id?: string;
    workstation_code?: string;
    workstation_name?: string;
    workstation_location?: string;
    workstation_cctv?: string;
    workstation_session_id?: string;
    package_code_verified?: boolean;
    package_code_verified_at?: string;
  packing_started_at?: string;
    packing?: {
      weight_kg?: number;
      length_cm?: number;
      width_cm?: number;
      height_cm?: number;
      colli_count?: number;
    };
    label_attached?: boolean;
    pack_photo_ids?: string[];
    label_photo_ids?: string[];
    /** @deprecated — gunakan completed_at */
    at?: string;
  };
  /** @deprecated — dibaca untuk migrasi */
  validate?: {
    position: ValidatePosition;
    user_id: string;
    user_name?: string;
    at: string;
  };
  pack?: {
    user_id: string;
    user_name?: string;
    at: string;
    photo_file_ids?: string[];
    label_attached?: boolean;
  };
  pickup?: {
    mode: "scan_label" | "manual_booking";
    driver_name?: string;
    driver_phone?: string;
    courier_company?: string;
    user_id: string;
    user_name?: string;
    at: string;
    photo_file_ids?: string[];
    signature_captured?: boolean;
    receipt_printed?: boolean;
    /** Scan booking/AWB saat serah terima — cocokkan fisik dengan sistem */
    physical_scan_code?: string;
    physical_verified_at?: string;
    physical_checks?: {
      package_count_ok?: boolean;
      label_readable?: boolean;
      seal_intact?: boolean;
    };
    /** Serah terima multi-paket — satu kurir, satu waktu */
    batch_id?: string;
    batch_size?: number;
    /** Nomor tanda terima (TT) — satu nomor untuk seluruh batch */
    tt_no?: string;
    /** Snapshot baris paket di TT (untuk cetak ulang bukti) */
    tt_lines?: {
      so_id: string;
      order_no: string;
      awb: string;
      pk_no?: string;
      store_name?: string;
      customer_name?: string;
    }[];
    /** Daftar AWB yang discan saat serah terima batch */
    recorded_awbs?: string[];
  };
  updated_at?: string;
};

const LEGACY_STAGE: Record<string, WmsOrderStage> = {
  pick_pending: "picking",
  pick_done: "validate_pack",
  validate_pending: "validate_pack",
  validate_done: "validate_pack",
  pack_done: "ready_pickup",
  pickup_done: "completed",
};

export function normalizeWmsStage(raw?: string | null): WmsOrderStage {
  if (!raw) return "new_order";
  if (raw in LEGACY_STAGE) return LEGACY_STAGE[raw];
  const s = raw as WmsOrderStage;
  if (
    s === "new_order" ||
    s === "picking" ||
    s === "validate_pack" ||
    s === "ready_pickup" ||
    s === "completed" ||
    s === "cancelled" ||
    s === "validation_failed"
  ) {
    return s;
  }
  return "new_order";
}

export const WMS_STAGE_UI: Record<WmsOrderStage, { label: string; cls: string }> = {
  new_order: { label: "Pesanan baru", cls: "bg-slate-100 text-slate-700" },
  picking: { label: "Picking", cls: "bg-violet-100 text-violet-800" },
  validate_pack: { label: "Validasi & Packing", cls: "bg-amber-100 text-amber-900" },
  ready_pickup: { label: "Siap ambil", cls: "bg-cyan-100 text-cyan-800" },
  completed: { label: "Selesai", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Dibatalkan", cls: "bg-red-100 text-red-800" },
  validation_failed: { label: "Validasi gagal", cls: "bg-orange-100 text-orange-900" },
};

/** @deprecated */
export const OUTBOUND_STAGE_UI = WMS_STAGE_UI;

function migratePackageFields(p: OutboundWorkflow): OutboundWorkflow {
  if (p.package_identity?.code?.trim()) {
    const code = p.package_identity.code.trim();
    return {
      ...p,
      package_code: p.package_code ?? code,
      package_qr_payload: p.package_qr_payload ?? buildPackageQrPayload(code),
    };
  }
  const awb = (p.tracking_code ?? p.order_meta?.tracking_no ?? "").trim();
  if (awb) {
    const code = awb;
    return {
      ...p,
      package_identity: { type: "awb", code, awb },
      package_code: code,
      package_qr_payload: buildPackageQrPayload(code),
      booking_no: undefined,
      booking_qr_payload: undefined,
    };
  }
  const legacy = (p.package_code ?? p.booking_no ?? "").trim();
  if (legacy && !legacy.startsWith("BKG-") && /^\d{8}$/.test(legacy)) {
    return {
      ...p,
      package_identity: { type: "internal", code: legacy, internal_package_code: legacy },
      package_code: legacy,
      package_qr_payload: buildPackageQrPayload(legacy),
      booking_no: undefined,
      booking_qr_payload: undefined,
    };
  }
  return p;
}

function migrateWorkflow(p: OutboundWorkflow): OutboundWorkflow {
  const stage = normalizeWmsStage(p.stage);
  const vp = p.validate_pack ?? (p.validate
    ? {
        position: p.validate.position,
        user_id: p.validate.user_id,
        user_name: p.validate.user_name,
        started_at: p.validate.at,
        completed_at: p.validate.at,
        at: p.validate.at,
        label_attached: p.pack?.label_attached,
        pack_photo_ids: p.pack?.photo_file_ids,
        cctv_no: undefined,
      }
    : undefined);

  return migratePackageFields({
    ...p,
    stage,
    validate_pack: vp,
    pick: p.pick ?? { user_id: "", lines: {} },
  });
}

export function parseOutboundWorkflow(raw?: string | null): OutboundWorkflow {
  if (!raw?.trim()) {
    return { stage: "new_order", pick: { user_id: "", lines: {} } };
  }
  try {
    const p = JSON.parse(raw) as OutboundWorkflow;
    if (!p || typeof p !== "object") return { stage: "new_order" };
    return migrateWorkflow({
      ...p,
      pick: p.pick ?? { user_id: "", lines: {} },
    });
  } catch {
    return { stage: "new_order" };
  }
}

export function serializeOutboundWorkflow(wf: OutboundWorkflow): string {
  return JSON.stringify({ ...wf, updated_at: new Date().toISOString() });
}

export function mergeOutboundLinesFromSo(
  wf: OutboundWorkflow,
  lines: SalesOrderLine[],
): OutboundWorkflow {
  const pickLines = { ...(wf.pick?.lines ?? {}) };
  for (const l of lines) {
    let serials: string[] | undefined;
    if (l.serial_numbers_json?.trim()) {
      try {
        const parsed = JSON.parse(l.serial_numbers_json) as unknown;
        if (Array.isArray(parsed)) {
          serials = parsed.map((x) => String(x).trim()).filter(Boolean);
        }
      } catch {
        /* ignore */
      }
    }
    if (!pickLines[l.product]) {
      pickLines[l.product] = {
        product_id: l.product,
        sku: l.sku_snapshot,
        name: l.name_snapshot,
        qty_required: Number(l.qty) || 0,
        qty_picked: 0,
        qty_validated: 0,
        serial_numbers: serials,
      };
    } else {
      pickLines[l.product].qty_required = Number(l.qty) || 0;
      if (serials?.length && !pickLines[l.product].serial_numbers?.length) {
        pickLines[l.product].serial_numbers = serials;
      }
    }
  }
  return {
    ...wf,
    pick: {
      user_id: wf.pick?.user_id ?? "",
      user_name: wf.pick?.user_name,
      started_at: wf.pick?.started_at ?? "",
      completed_at: wf.pick?.completed_at ?? "",
      warehouse_id: wf.pick?.warehouse_id,
      lines: pickLines,
    },
  };
}

export function syncPickLinesFromUi(
  wf: OutboundWorkflow,
  uiLines: {
    product: string;
    sku?: string;
    name?: string;
    qty: number;
    picked: number;
    serial_numbers?: string[];
  }[],
): OutboundWorkflow {
  const pickLines = { ...(wf.pick?.lines ?? {}) };
  for (const l of uiLines) {
    const prev = pickLines[l.product];
    pickLines[l.product] = {
      product_id: l.product,
      sku: l.sku ?? prev?.sku,
      name: l.name ?? prev?.name,
      qty_required: l.qty,
      qty_picked: l.picked,
      qty_validated: prev?.qty_validated ?? 0,
      serial_numbers: l.serial_numbers ?? prev?.serial_numbers ?? [],
    };
  }
  return {
    ...wf,
    pick: {
      user_id: wf.pick?.user_id ?? "",
      user_name: wf.pick?.user_name,
      started_at: wf.pick?.started_at ?? "",
      completed_at: wf.pick?.completed_at ?? "",
      lines: pickLines,
    },
  };
}

export function isPickComplete(wf: OutboundWorkflow): boolean {
  const lines = Object.values(wf.pick?.lines ?? {});
  if (lines.length === 0) return false;
  return lines.every((l) => l.qty_picked >= l.qty_required && l.qty_required > 0);
}

export function isValidateComplete(wf: OutboundWorkflow): boolean {
  const lines = Object.values(wf.pick?.lines ?? {});
  if (lines.length === 0) return false;
  return lines.every((l) => l.qty_validated >= l.qty_required && l.qty_required > 0);
}

export function canCancelFromPicking(stage: WmsOrderStage): boolean {
  return stage === "new_order" || stage === "picking";
}

export function canCancelFromValidatePack(stage: WmsOrderStage): boolean {
  return stage === "validate_pack" || stage === "validation_failed";
}

export function isSoAwaitingPicking(so: Pick<SalesOrder, "outbound_workflow_json">): boolean {
  const s = parseOutboundWorkflow(so.outbound_workflow_json).stage;
  return s === "new_order" || s === "picking";
}

export function isSoAwaitingValidation(so: Pick<SalesOrder, "outbound_workflow_json">): boolean {
  const s = parseOutboundWorkflow(so.outbound_workflow_json).stage;
  return s === "validate_pack";
}

export function isSoAwaitingPickup(so: Pick<SalesOrder, "outbound_workflow_json">): boolean {
  return parseOutboundWorkflow(so.outbound_workflow_json).stage === "ready_pickup";
}

export function isSoOutboundComplete(
  so: Pick<SalesOrder, "outbound_workflow_json" | "status" | "warehouse_process_status">,
): boolean {
  const s = parseOutboundWorkflow(so.outbound_workflow_json).stage;
  return (
    s === "completed" ||
    so.status === "delivered" ||
    so.warehouse_process_status === "complete"
  );
}

export function isSoCancelled(so: Pick<SalesOrder, "outbound_workflow_json">): boolean {
  return parseOutboundWorkflow(so.outbound_workflow_json).stage === "cancelled";
}

export function filterSalesOrdersForPickingQueue<T extends Pick<SalesOrder, "outbound_workflow_json">>(
  orders: T[],
): T[] {
  return orders.filter(isSoAwaitingPicking);
}

export function outboundStageStepIndex(stage: WmsOrderStage): number {
  switch (stage) {
    case "new_order":
    case "picking":
      return 0;
    case "validate_pack":
    case "validation_failed":
      return 1;
    case "ready_pickup":
      return 2;
    case "completed":
      return 3;
    case "cancelled":
      return 3;
    default:
      return 0;
  }
}

export function getOutboundStageFromSo(
  so: Pick<SalesOrder, "outbound_workflow_json" | "warehouse_process_status" | "status">,
): WmsOrderStage {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  if (wf.stage) return wf.stage;
  if (so.status === "delivered") return "completed";
  if (so.warehouse_process_status === "complete") return "completed";
  return "new_order";
}

export function buildPackageQrPayload(code: string): string {
  return `serba:pkg:${code.trim()}`;
}

/** @deprecated — gunakan buildPackageQrPayload */
export function buildBookingQrPayload(code: string): string {
  return buildPackageQrPayload(code);
}

export function parsePackageScanPayload(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith("serba:pk:")) {
    return s.slice("serba:pk:".length).trim() || null;
  }
  if (lower.startsWith("serba:pkg:")) {
    return s.slice("serba:pkg:".length).trim() || null;
  }
  if (lower.startsWith("serba:booking:")) {
    return s.slice("serba:booking:".length).trim() || null;
  }
  if (/^pk-\d{8}-\d{5}$/i.test(s)) return s.toUpperCase();
  return s;
}

/** @deprecated — gunakan parsePackageScanPayload */
export function parseBookingQrPayload(raw: string): string | null {
  return parsePackageScanPayload(raw);
}
