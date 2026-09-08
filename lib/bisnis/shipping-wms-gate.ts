import {
  hasShippingData,
  isShippingActive,
  parseNotesWithShipping,
} from "./shipping-notes";
import { getWmsFulfillmentMode } from "@/lib/wms/fulfillment-mode";

export type WmsShippingCheck = {
  ok: boolean;
  missing: string[];
  message: string | null;
};

const LABELS: Record<string, string> = {
  courier: "ekspedisi / kurir",
  service: "layanan pengiriman",
  address: "alamat penerima",
  shipping: "data pengiriman (panel kanan saat buat SO)",
};

/**
 * Gate kirim ke WMS:
 * - Ambil sendiri (tanpa info pengiriman) → OK
 * - Dikirim → wajib ekspedisi, layanan, alamat (ongkir boleh 0)
 */
export function checkShippingForWms(notes?: string | null): WmsShippingCheck {
  const mode = getWmsFulfillmentMode(notes);
  if (mode === "pickup") {
    return { ok: true, missing: [], message: null };
  }

  const { shipping } = parseNotesWithShipping(notes ?? "");
  const missing: string[] = [];

  if (!shipping.courier.trim()) missing.push("courier");
  if (!shipping.shipping_service.trim()) missing.push("service");
  if (!shipping.recipient_address.trim()) missing.push("address");
  if (!isShippingActive(shipping) && !hasShippingData(shipping)) {
    missing.push("shipping");
  }

  if (missing.length === 0) {
    return { ok: true, missing: [], message: null };
  }

  const parts = missing.map((k) => LABELS[k] ?? k);
  return {
    ok: false,
    missing,
    message: `Pengiriman belum lengkap untuk WMS (mode dikirim): ${parts.join(", ")}. Isi di penjualan (ekspedisi, layanan, alamat, ongkir boleh 0). Atau kosongkan info pengiriman untuk ambil sendiri.`,
  };
}

export function assertShippingForWms(notes?: string | null): void {
  const check = checkShippingForWms(notes);
  if (!check.ok) throw new Error(check.message ?? "Pengiriman belum lengkap untuk WMS.");
}

export function formatShippingCostId(amount: number): string {
  if (!amount || amount <= 0) return "Rp 0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
