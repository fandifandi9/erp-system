import type PocketBase from "pocketbase";
import { getDamagedWarehouse } from "@/lib/bisnis/entity-modules";
import type { ReturLineCondition } from "@/lib/bisnis/types";

export type CreateSalesReturLineInput = {
  sales_order_line: string;
  qty: number;
  expected_condition: ReturLineCondition;
  reason?: string;
};

/** Jenis beban penjual (outgoing). */
export type SettlementOutgoingType =
  | "refund_customer"
  | "seller_shipping"
  | "voucher"
  | "cashback"
  | "goodwill"
  | "other_expense";

/** Jenis recovery (incoming). */
export type SettlementIncomingType =
  | "recovery_marketplace"
  | "recovery_supplier"
  | "recovery_courier"
  | "recovery_insurance"
  | "recovery_other";

export type SettlementItemType = SettlementOutgoingType | SettlementIncomingType;

export type SettlementEstimateItem = {
  type: SettlementItemType;
  amount: number;
};

export type SalesReturSettlementEstimate = {
  items: SettlementEstimateItem[];
};

export const SETTLEMENT_OUTGOING_LABELS: Record<SettlementOutgoingType, string> = {
  refund_customer: "Kembalikan dana",
  seller_shipping: "Ongkir ditanggung penjual",
  voucher: "Voucher",
  cashback: "Cashback",
  goodwill: "Goodwill",
  other_expense: "Biaya Lain",
};

export const SETTLEMENT_INCOMING_LABELS: Record<SettlementIncomingType, string> = {
  recovery_marketplace: "Marketplace",
  recovery_supplier: "Supplier",
  recovery_courier: "Kurir",
  recovery_insurance: "Asuransi",
  recovery_other: "Lainnya",
};

export function isSettlementOutgoingType(type: SettlementItemType): type is SettlementOutgoingType {
  return type in SETTLEMENT_OUTGOING_LABELS;
}

export function isSettlementIncomingType(type: SettlementItemType): type is SettlementIncomingType {
  return type in SETTLEMENT_INCOMING_LABELS;
}

export function emptySettlementEstimate(): SalesReturSettlementEstimate {
  return { items: [] };
}

/** Normalisasi estimasi — dukung format lama (outgoing/incoming object) dan format baru (items[]). */
export function normalizeSettlementEstimate(raw: unknown): SalesReturSettlementEstimate {
  if (!raw || typeof raw !== "object") return emptySettlementEstimate();

  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.items)) {
    const items: SettlementEstimateItem[] = [];
    for (const row of obj.items) {
      if (!row || typeof row !== "object") continue;
      const r = row as { type?: string; amount?: number };
      if (!r.type || !(r.type in SETTLEMENT_OUTGOING_LABELS || r.type in SETTLEMENT_INCOMING_LABELS)) {
        continue;
      }
      const amount = Math.max(0, Number(r.amount) || 0);
      if (amount <= 0) continue;
      items.push({ type: r.type as SettlementItemType, amount });
    }
    return { items };
  }

  const items: SettlementEstimateItem[] = [];
  const outgoing = obj.outgoing as Record<string, number> | undefined;
  const incoming = obj.incoming as Record<string, number> | undefined;

  if (outgoing) {
    for (const [key, val] of Object.entries(outgoing)) {
      const amount = Math.max(0, Number(val) || 0);
      if (amount <= 0) continue;
      if (key === "goodwill_cashback") {
        items.push({ type: "goodwill", amount: Math.round(amount / 2) });
        items.push({ type: "cashback", amount: Math.ceil(amount / 2) });
        continue;
      }
      if (key in SETTLEMENT_OUTGOING_LABELS) {
        items.push({ type: key as SettlementOutgoingType, amount });
      }
    }
  }
  if (incoming) {
    for (const [key, val] of Object.entries(incoming)) {
      const amount = Math.max(0, Number(val) || 0);
      if (amount <= 0) continue;
      if (key in SETTLEMENT_INCOMING_LABELS) {
        items.push({ type: key as SettlementIncomingType, amount });
      }
    }
  }
  return { items };
}

export function parseSettlementEstimateJson(raw?: string | null): SalesReturSettlementEstimate {
  if (!raw?.trim()) return emptySettlementEstimate();
  try {
    return normalizeSettlementEstimate(JSON.parse(raw));
  } catch {
    return emptySettlementEstimate();
  }
}

export function serializeSettlementEstimate(estimate: SalesReturSettlementEstimate): string {
  const items = estimate.items.filter((i) => i.amount > 0);
  return JSON.stringify({ items });
}

export function sumSettlementByType(
  estimate: SalesReturSettlementEstimate,
  type: SettlementItemType,
): number {
  return estimate.items
    .filter((i) => i.type === type)
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

/** Map estimasi ke field legacy yang dipakai accounting saat ini. */
export function legacyAmountsFromSettlement(estimate?: SalesReturSettlementEstimate): {
  mp_claim_amount: number;
  shipping_reimb_amount: number;
} {
  const items = estimate?.items ?? [];
  return {
    mp_claim_amount: items
      .filter((i) => i.type === "recovery_marketplace")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0),
    shipping_reimb_amount: items
      .filter((i) => i.type === "seller_shipping")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0),
  };
}

export type CreateSalesReturInput = {
  reason?: string;
  /** Catatan claim / internal bisnis. */
  notes?: string;
  /** Instruksi ke tim WMS. */
  notes_for_wms?: string;
  /** Nomor retur platform (MP) — menggantikan tampilan RET sistem. */
  platform_retur_no?: string;
  /** Cara pengembalian barang ke gudang. */
  return_method?: "dropoff" | "courier";
  /** Nama ekspedisi (wajib jika return_method = courier). */
  return_courier?: string;
  /** Nomor lacak / resi retur (wajib jika via ekspedisi). */
  return_tracking_no?: string;
  /** @deprecated gunakan settlement_estimate */
  mp_claim_amount?: number;
  /** @deprecated gunakan settlement_estimate */
  shipping_reimb_amount?: number;
  settlement_estimate?: SalesReturSettlementEstimate;
  lines: CreateSalesReturLineInput[];
};

export const EXPECTED_CONDITION_LABEL: Record<ReturLineCondition, string> = {
  good: "Layak dijual kembali",
  damaged: "Tidak layak dijual kembali",
};

export function expectedWarehouseRoleLabel(condition: ReturLineCondition): string {
  return condition === "damaged" ? "Gudang rusak" : "Gudang penjualan";
}

/**
 * Resolve gudang tujuan dari kondisi + konfigurasi entitas.
 * User tidak memilih gudang — hanya sistem yang menentukan.
 */
export async function resolveExpectedWarehouseForRetur(
  pb: PocketBase,
  input: {
    companyId: string;
    salesWarehouseId: string;
    condition: ReturLineCondition;
  },
): Promise<string> {
  if (input.condition === "good") {
    if (!input.salesWarehouseId) {
      throw new Error("SO tidak punya gudang penjualan untuk barang layak dijual.");
    }
    return input.salesWarehouseId;
  }

  const damaged = await getDamagedWarehouse(input.companyId, pb);
  if (!damaged?.id) {
    throw new Error(
      "Gudang rusak belum dikonfigurasi untuk entitas ini. Atur gudang rusak di pengaturan perusahaan.",
    );
  }
  return damaged.id;
}
