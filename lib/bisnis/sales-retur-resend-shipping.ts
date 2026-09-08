/** Meta pengiriman saat bisnis tolak retur → kirim kembali. */

export type ResendShippingPayer = "seller" | "customer";

export type ResendShippingInfo = {
  courier: string;
  shipping_service: string;
  recipient_address: string;
  shipping_cost: number;
  /** seller = toko/perusahaan bayar; customer = pelanggan bayar. */
  shipping_payer: ResendShippingPayer;
};

export function emptyResendShipping(): ResendShippingInfo {
  return {
    courier: "",
    shipping_service: "",
    recipient_address: "",
    shipping_cost: 0,
    shipping_payer: "seller",
  };
}

export function parseResendShippingJson(raw?: string | null): ResendShippingInfo | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as Partial<ResendShippingInfo>;
    return {
      courier: String(j.courier ?? "").trim(),
      shipping_service: String(j.shipping_service ?? "").trim(),
      recipient_address: String(j.recipient_address ?? "").trim(),
      shipping_cost: Math.max(0, Number(j.shipping_cost) || 0),
      shipping_payer: j.shipping_payer === "customer" ? "customer" : "seller",
    };
  } catch {
    return null;
  }
}

export function serializeResendShipping(info: ResendShippingInfo): string {
  return JSON.stringify({
    courier: info.courier.trim(),
    shipping_service: info.shipping_service.trim(),
    recipient_address: info.recipient_address.trim(),
    shipping_cost: Math.max(0, Number(info.shipping_cost) || 0),
    shipping_payer: info.shipping_payer === "customer" ? "customer" : "seller",
  });
}

export function resendShippingPayerLabel(payer: ResendShippingPayer, locale: "id" | "en" = "id"): string {
  if (locale === "en") {
    return payer === "customer" ? "Customer pays shipping" : "Seller pays shipping";
  }
  return payer === "customer" ? "Pelanggan bayar ongkir" : "Toko / penjual bayar ongkir";
}
