/** Marker di field notes PO/SO/invoice/bill — tidak perlu field PB terpisah. */
export const SHIPPING_NOTES_MARKER = "---info-pengiriman---";

export type ShippingInfo = {
  enabled: boolean;
  courier: string;
  tracking_no: string;
  shipping_cost: number;
  recipient_address: string;
};

export const emptyShippingInfo = (): ShippingInfo => ({
  enabled: false,
  courier: "",
  tracking_no: "",
  shipping_cost: 0,
  recipient_address: "",
});

function parseShippingBlock(block: string): ShippingInfo {
  let courier = "";
  let tracking_no = "";
  let shipping_cost = 0;
  let recipient_address = "";
  for (const line of block.split("\n")) {
    const c = line.match(/^Expedisi:\s*(.*)$/i);
    if (c) courier = c[1].trim();
    const t = line.match(/^Nomor lacak:\s*(.*)$/i);
    if (t) tracking_no = t[1].trim();
    const s = line.match(/^Ongkir:\s*([0-9.,]+)\s*$/i);
    if (s) {
      const normalized = s[1].replace(/\./g, "").replace(",", ".");
      shipping_cost = Number(normalized) || 0;
    }
    const a = line.match(/^Alamat penerima:\s*(.*)$/i);
    if (a) recipient_address = a[1].trim();
  }
  return {
    enabled: !!(courier || tracking_no || shipping_cost > 0 || recipient_address),
    courier,
    tracking_no,
    shipping_cost,
    recipient_address,
  };
}

/** Pisahkan catatan teks vs blok pengiriman. */
export function parseNotesWithShipping(raw?: string | null): {
  textNotes: string;
  shipping: ShippingInfo;
} {
  if (!raw?.trim()) {
    return { textNotes: "", shipping: emptyShippingInfo() };
  }
  const idx = raw.indexOf(SHIPPING_NOTES_MARKER);
  if (idx === -1) {
    return { textNotes: raw.trim(), shipping: emptyShippingInfo() };
  }
  const textNotes = raw.slice(0, idx).replace(/\n+$/, "").trim();
  const block = raw.slice(idx + SHIPPING_NOTES_MARKER.length).replace(/^\n+/, "");
  const shipping = parseShippingBlock(block);
  return { textNotes, shipping };
}

/** Gabungkan pesan/memo dengan info pengiriman (jika aktif). */
export function buildNotesWithShipping(
  textNotes: string | undefined,
  shipping: ShippingInfo,
): string | undefined {
  const base = (textNotes ?? "").trim();
  if (!shipping.enabled) {
    return base || undefined;
  }
  const courier = shipping.courier.trim();
  const tracking = shipping.tracking_no.trim();
  const recipientAddress = shipping.recipient_address.trim();
  const shipCost = Math.max(0, Number(shipping.shipping_cost) || 0);
  const block =
    `${SHIPPING_NOTES_MARKER}\n` +
    `Expedisi: ${courier}\n` +
    `Nomor lacak: ${tracking}\n` +
    `Ongkir: ${shipCost}\n` +
    `Alamat penerima: ${recipientAddress}`;
  return base ? `${base}\n${block}` : block;
}

export function formatShippingDisplay(shipping: ShippingInfo): string | null {
  if (!shipping.enabled) return null;
  const parts: string[] = [];
  if (shipping.courier.trim()) parts.push(`Expedisi: ${shipping.courier.trim()}`);
  if (shipping.tracking_no.trim()) parts.push(`Nomor lacak: ${shipping.tracking_no.trim()}`);
  if ((shipping.shipping_cost ?? 0) > 0) {
    parts.push(`Ongkir: Rp ${new Intl.NumberFormat("id-ID").format(shipping.shipping_cost)}`);
  }
  if (shipping.recipient_address.trim()) {
    parts.push(`Alamat: ${shipping.recipient_address.trim()}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
