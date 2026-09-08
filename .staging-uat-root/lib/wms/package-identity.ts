import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { parsePosNotes } from "@/lib/pos/meta";
import { getPkFromSo } from "./pk-identity";
import { formatPkDisplay } from "./pk-number";
import {
  buildPackageQrPayload,
  parsePackageScanPayload,
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  type OutboundWorkflow,
  type PackageIdentityState,
  type PackageIdentityType,
} from "./outbound-workflow";
import { fetchSalesOrder, updateSalesOrder } from "@/lib/bisnis/client";

export type { PackageIdentityState, PackageIdentityType };
export { parsePackageScanPayload, buildPackageQrPayload };

export type PackageIdentityView = {
  type: PackageIdentityType;
  code: string;
  typeLabel: string;
  qrPayload: string;
  internalHistory: string[];
};

function escapeFilter(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** AWB / nomor lacak dari marketplace atau ekspedisi. */
export function extractAwbFromOrder(
  so: Pick<SalesOrder, "notes" | "outbound_workflow_json">,
  wf?: OutboundWorkflow,
): string | null {
  const parsed = wf ?? parseOutboundWorkflow(so.outbound_workflow_json);
  const notes = so.notes ?? "";
  const { shipping } = parseNotesWithShipping(notes);
  const posMeta = parsePosNotes(notes);
  const posAwb = posMeta?.shipping?.awb?.trim();

  let textAwb = "";
  const awbLine = notes.match(/^AWB:\s*(.+)$/im);
  if (awbLine?.[1]) {
    const v = awbLine[1].trim();
    if (v && !/nomor pickup otomatis/i.test(v)) textAwb = v;
  }

  const raw =
    parsed.package_identity?.awb ??
    (parsed.package_identity?.type === "awb" ? parsed.package_identity.code : undefined) ??
    parsed.order_meta?.tracking_no ??
    posAwb ??
    textAwb ??
    shipping.tracking_no ??
    "";
  const t = String(raw).trim();
  return t || null;
}

export function isInternalPackageCode(code: string): boolean {
  return /^\d{8}$/.test(code.trim());
}

export async function generateUniqueInternalPackageCode(): Promise<string> {
  for (let attempt = 0; attempt < 64; attempt++) {
    const code = String(10000000 + Math.floor(Math.random() * 90000000));
    try {
      const hit = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList(1, 1, {
        filter: `wms_booking_no = "${escapeFilter(code)}"`,
        fields: "id",
        requestKey: null,
      });
      if (hit.totalItems === 0) return code;
    } catch {
      return code;
    }
  }
  throw new Error("Gagal membuat Internal Package Code unik.");
}

function legacyBookingToCode(booking?: string | null): string | null {
  if (!booking?.trim()) return null;
  const b = booking.trim();
  if (b.startsWith("BKG-")) return null;
  if (isInternalPackageCode(b)) return b;
  return b;
}

/** Tampilan identitas aktif (satu kode saja). */
export function getPackageIdentityView(
  so: Pick<SalesOrder, "notes" | "outbound_workflow_json" | "wms_booking_no" | "pk_no" | "order_no">,
  wfIn?: OutboundWorkflow,
): PackageIdentityView {
  const wf = wfIn ?? parseOutboundWorkflow(so.outbound_workflow_json);
  const pi = wf.package_identity;

  if (pi?.code?.trim()) {
    return {
      type: pi.type,
      code: pi.code.trim(),
      typeLabel: pi.type === "awb" ? "AWB" : "Internal Package Code",
      qrPayload: wf.package_qr_payload ?? buildPackageQrPayload(pi.code),
      internalHistory: pi.internal_code_history ?? [],
    };
  }

  const awb = extractAwbFromOrder(so, wf);
  if (awb) {
    return {
      type: "awb",
      code: awb,
      typeLabel: "AWB",
      qrPayload: buildPackageQrPayload(awb),
      internalHistory: pi?.internal_code_history ?? [],
    };
  }

  const pkFromSo = getPkFromSo(so);
  if (pkFromSo) {
    const code = formatPkDisplay(pkFromSo);
    return {
      type: "internal",
      code,
      typeLabel: "Nomor pesanan",
      qrPayload: buildPackageQrPayload(code),
      internalHistory: pi?.internal_code_history ?? [],
    };
  }

  const internal =
    legacyBookingToCode(so.wms_booking_no) ??
    legacyBookingToCode(wf.package_code) ??
    legacyBookingToCode(wf.booking_no) ??
    (pi?.internal_package_code && isInternalPackageCode(pi.internal_package_code)
      ? pi.internal_package_code
      : null);

  if (internal) {
    return {
      type: "internal",
      code: internal,
      typeLabel: "Internal Package Code",
      qrPayload: buildPackageQrPayload(internal),
      internalHistory: pi?.internal_code_history ?? [],
    };
  }

  return {
    type: "internal",
    code: "—",
    typeLabel: "Internal Package Code",
    qrPayload: "",
    internalHistory: [],
  };
}

export function applyPackageIdentityToWorkflow(
  wf: OutboundWorkflow,
  identity: PackageIdentityState,
): OutboundWorkflow {
  const code = identity.code.trim();
  const qr = buildPackageQrPayload(code);
  return {
    ...wf,
    package_identity: {
      ...identity,
      code,
      assigned_at: identity.assigned_at ?? new Date().toISOString(),
    },
    package_code: code,
    package_qr_payload: qr,
    tracking_code: identity.type === "awb" ? code : undefined,
    booking_no: undefined,
    booking_qr_payload: undefined,
    order_meta: {
      ...wf.order_meta,
      order_no: wf.order_meta?.order_no ?? "",
      package_code: code,
      tracking_no: identity.type === "awb" ? code : undefined,
      booking_no: undefined,
    },
  };
}

export async function resolveAndAssignPackageIdentity(
  so: SalesOrder,
  wf?: OutboundWorkflow,
): Promise<{ identity: PackageIdentityState; workflow: OutboundWorkflow }> {
  const base = wf ?? parseOutboundWorkflow(so.outbound_workflow_json);
  const existing = getPackageIdentityView(so, base);
  const awb = extractAwbFromOrder(so, base);

  if (awb) {
    const history = [...existing.internalHistory];
    if (
      existing.type === "internal" &&
      existing.code !== "—" &&
      existing.code !== awb &&
      !history.includes(existing.code)
    ) {
      history.push(existing.code);
    }
    const identity: PackageIdentityState = {
      type: "awb",
      code: awb,
      awb,
      internal_package_code: history[history.length - 1],
      internal_code_history: history.length ? history : undefined,
      assigned_at: base.package_identity?.assigned_at ?? new Date().toISOString(),
    };
    return {
      identity,
      workflow: applyPackageIdentityToWorkflow(base, identity),
    };
  }

  if (existing.code !== "—") {
    const identity: PackageIdentityState = {
      type: existing.type,
      code: existing.code,
      internal_package_code: existing.type === "internal" ? existing.code : base.package_identity?.internal_package_code,
      internal_code_history: existing.internalHistory,
      assigned_at: base.package_identity?.assigned_at,
    };
    return {
      identity,
      workflow: applyPackageIdentityToWorkflow(base, identity),
    };
  }

  const pkFromSo = getPkFromSo(so);
  if (pkFromSo) {
    const code = formatPkDisplay(pkFromSo);
    const identity: PackageIdentityState = {
      type: "internal",
      code,
      internal_package_code: code,
      assigned_at: new Date().toISOString(),
    };
    return {
      identity,
      workflow: applyPackageIdentityToWorkflow(base, identity),
    };
  }

  const internal = await generateUniqueInternalPackageCode();
  const identity: PackageIdentityState = {
    type: "internal",
    code: internal,
    internal_package_code: internal,
    assigned_at: new Date().toISOString(),
  };
  return {
    identity,
    workflow: applyPackageIdentityToWorkflow(base, identity),
  };
}

/** Saat AWB diterima belakangan — AWB jadi identitas utama, internal tetap di riwayat. */
export async function upgradePackageIdentityToAwb(
  soId: string,
  awbRaw: string,
): Promise<SalesOrder> {
  const awb = awbRaw.trim();
  if (!awb) throw new Error("AWB tidak boleh kosong.");

  const so = await fetchSalesOrder(soId);
  let wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const prev = getPackageIdentityView(so, wf);
  const history = [...(wf.package_identity?.internal_code_history ?? [])];

  if (prev.type === "internal" && prev.code !== "—" && isInternalPackageCode(prev.code)) {
    if (!history.includes(prev.code)) history.push(prev.code);
  }

  const identity: PackageIdentityState = {
    type: "awb",
    code: awb,
    awb,
    internal_package_code: prev.type === "internal" ? prev.code : wf.package_identity?.internal_package_code,
    internal_code_history: history.length ? history : undefined,
    assigned_at: new Date().toISOString(),
  };

  wf = applyPackageIdentityToWorkflow(wf, identity);
  return updateSalesOrder(soId, {
    wms_booking_no: awb,
    outbound_workflow_json: serializeOutboundWorkflow(wf),
  });
}

/** Sinkronkan notes pengiriman → upgrade ke AWB bila sebelumnya internal. */
export async function syncPackageIdentityFromShippingNotes(soId: string): Promise<SalesOrder | null> {
  const so = await fetchSalesOrder(soId);
  const awb = extractAwbFromOrder(so);
  if (!awb) return null;
  const view = getPackageIdentityView(so);
  if (view.type === "awb" && view.code === awb) return so;
  return upgradePackageIdentityToAwb(soId, awb);
}
