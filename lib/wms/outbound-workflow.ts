import type { SalesOrder, SalesOrderLine } from "@/lib/bisnis/types";

/** Tahapan pengeluaran SO di gudang (beda dari PO: masuk → QC → label → putaway). */
export type OutboundStage =
  | "pick_pending"
  | "pick_done"
  | "validate_pending"
  | "validate_done"
  | "pack_done"
  | "pickup_done";

export type ValidatePosition = "A" | "B" | "C";

export type OutboundLineState = {
  product_id: string;
  sku?: string;
  name?: string;
  qty_required: number;
  qty_picked: number;
  qty_validated: number;
};

export type OutboundWorkflow = {
  stage: OutboundStage;
  entry_mode?: "manual" | "tracking_scan";
  tracking_code?: string;
  booking_no?: string;
  booking_qr_payload?: string;
  pick?: {
    user_id: string;
    user_name?: string;
    at: string;
    lines: Record<string, OutboundLineState>;
  };
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
    user_id: string;
    user_name?: string;
    at: string;
    photo_file_ids?: string[];
    signature_captured?: boolean;
    receipt_printed?: boolean;
  };
  updated_at?: string;
};

export const OUTBOUND_STAGE_UI: Record<OutboundStage, { label: string; cls: string }> = {
  pick_pending: { label: "Menunggu picking", cls: "bg-slate-100 text-slate-700" },
  pick_done: { label: "Picking selesai", cls: "bg-violet-100 text-violet-800" },
  validate_pending: { label: "Menunggu validasi", cls: "bg-amber-100 text-amber-900" },
  validate_done: { label: "Validasi selesai", cls: "bg-blue-100 text-blue-800" },
  pack_done: { label: "Packing selesai", cls: "bg-pink-100 text-pink-800" },
  pickup_done: { label: "Sudah pickup", cls: "bg-emerald-100 text-emerald-800" },
};

export function parseOutboundWorkflow(raw?: string | null): OutboundWorkflow {
  if (!raw?.trim()) {
    return { stage: "pick_pending", pick: { user_id: "", at: "", lines: {} } };
  }
  try {
    const p = JSON.parse(raw) as OutboundWorkflow;
    if (!p || typeof p !== "object") return { stage: "pick_pending" };
    return {
      stage: p.stage ?? "pick_pending",
      ...p,
      pick: p.pick ?? { user_id: "", at: "", lines: p.pick?.lines ?? {} },
    };
  } catch {
    return { stage: "pick_pending" };
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
    if (!pickLines[l.product]) {
      pickLines[l.product] = {
        product_id: l.product,
        sku: l.sku_snapshot,
        name: l.name_snapshot,
        qty_required: Number(l.qty) || 0,
        qty_picked: 0,
        qty_validated: 0,
      };
    } else {
      pickLines[l.product].qty_required = Number(l.qty) || 0;
    }
  }
  return {
    ...wf,
    pick: {
      user_id: wf.pick?.user_id ?? "",
      user_name: wf.pick?.user_name,
      at: wf.pick?.at ?? "",
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

export function validateCanAdvanceToValidate(wf: OutboundWorkflow): string | null {
  if (wf.stage === "pick_pending" && !isPickComplete(wf)) {
    return "Picking belum lengkap — semua produk harus diambil sesuai jumlah.";
  }
  if (!wf.booking_no) return "Nomor booking belum dibuat — selesaikan picking dulu.";
  return null;
}

export function validateCanAdvanceToPack(wf: OutboundWorkflow): string | null {
  if (!wf.validate?.position) return "Pilih pos kerja (A/B/C) dan selesaikan validasi scan.";
  if (!isValidateComplete(wf)) {
    return "Validasi belum lengkap — scan semua produk sampai jumlah cocok.";
  }
  return null;
}

export function getOutboundStageFromSo(
  so: Pick<SalesOrder, "outbound_workflow_json" | "warehouse_process_status" | "status">,
): OutboundStage {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  if (wf.stage) return wf.stage;
  if (so.status === "delivered") return "pickup_done";
  if (so.warehouse_process_status === "complete") return "pack_done";
  return "pick_pending";
}

export function buildBookingQrPayload(bookingNo: string): string {
  return `serba:booking:${bookingNo.trim().toUpperCase()}`;
}

export function parseBookingQrPayload(raw: string): string | null {
  const s = raw.trim();
  if (!s.toLowerCase().startsWith("serba:booking:")) return null;
  return s.slice("serba:booking:".length).trim() || null;
}
