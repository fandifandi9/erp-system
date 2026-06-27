import { findCourierNameForService } from "./couriers";

/** Marker di field notes PO/SO/invoice/bill — tidak perlu field PB terpisah. */
export const SHIPPING_NOTES_MARKER = "---info-pengiriman---";

export type ShippingInfo = {
  enabled: boolean;
  courier: string;
  shipping_service: string;
  tracking_no: string;
  shipping_cost: number;
  recipient_address: string;
};

export const emptyShippingInfo = (): ShippingInfo => ({
  enabled: false,
  courier: "",
  shipping_service: "",
  tracking_no: "",
  shipping_cost: 0,
  recipient_address: "",
});

const NESTED_NOTE_MARKERS = [
  "---info-transfer---",
  "---catatan-proses-internal---",
  "---info-pengiriman---",
];

export function hasShippingData(shipping: ShippingInfo): boolean {
  return !!(
    shipping.courier.trim() ||
    shipping.shipping_service.trim() ||
    shipping.tracking_no.trim() ||
    (shipping.shipping_cost ?? 0) > 0 ||
    shipping.recipient_address.trim()
  );
}

/** Panel pengiriman aktif — checkbox atau sudah ada isi. */
export function isShippingActive(shipping: ShippingInfo): boolean {
  return shipping.enabled || hasShippingData(shipping);
}

/** Pastikan blok pengiriman ikut tersimpan walau checkbox sempat off. */
export function enrichShippingFromCatalog(shipping: ShippingInfo): ShippingInfo {
  if (shipping.courier.trim() || !shipping.shipping_service.trim()) return shipping;
  const courier = findCourierNameForService(shipping.shipping_service);
  if (!courier) return shipping;
  return { ...shipping, courier };
}

export function normalizeShippingForSave(shipping: ShippingInfo): ShippingInfo {
  const enriched = enrichShippingFromCatalog(shipping);
  const has = hasShippingData(enriched);
  if (!has) return { ...enriched, enabled: false };
  return { ...enriched, enabled: true };
}

type ShippingPartial = Partial<
  Pick<
    ShippingInfo,
    "courier" | "shipping_service" | "tracking_no" | "shipping_cost" | "recipient_address"
  >
>;

function mergeShippingFields(base: ShippingInfo, patch: ShippingPartial): ShippingInfo {
  const next = { ...base };
  if (!next.courier.trim() && patch.courier?.trim()) next.courier = patch.courier.trim();
  if (!next.shipping_service.trim() && patch.shipping_service?.trim()) {
    next.shipping_service = patch.shipping_service.trim();
  }
  if (!next.tracking_no.trim() && patch.tracking_no?.trim()) {
    next.tracking_no = patch.tracking_no.trim();
  }
  if (!(next.shipping_cost > 0) && (patch.shipping_cost ?? 0) > 0) {
    next.shipping_cost = patch.shipping_cost ?? 0;
  }
  if (!next.recipient_address.trim() && patch.recipient_address?.trim()) {
    next.recipient_address = patch.recipient_address.trim();
  }
  if (hasShippingData(next)) next.enabled = true;
  return next;
}

/** Ambil Kurir/Layanan dari teks bebas (mis. catatan POS) sebelum marker terstruktur. */
export function scrapeCourierServiceFromText(text?: string | null): ShippingPartial {
  if (!text?.trim()) return {};
  let courier = "";
  let shipping_service = "";
  for (const line of text.split(/\r?\n/)) {
    const kurir = line.match(/^(?:Expedisi|Kurir):\s*(.*)$/i);
    if (kurir) courier = kurir[1].trim();
    const lay = line.match(/^Layanan:\s*(.*)$/i);
    if (lay) shipping_service = lay[1].trim();
  }
  return { courier, shipping_service };
}

function parseShippingBlock(block: string): ShippingInfo {
  let courier = "";
  let shipping_service = "";
  let tracking_no = "";
  let shipping_cost = 0;
  let recipient_address = "";
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (NESTED_NOTE_MARKERS.includes(trimmed)) break;

    const c = line.match(/^(?:Expedisi|Kurir):\s*(.*)$/i);
    if (c) courier = c[1].trim();
    const svc = line.match(/^Layanan:\s*(.*)$/i);
    if (svc) shipping_service = svc[1].trim();
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
    enabled: !!(courier || shipping_service || tracking_no || shipping_cost > 0 || recipient_address),
    courier,
    shipping_service,
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
    const scraped = scrapeCourierServiceFromText(raw);
    const shipping = mergeShippingFields(emptyShippingInfo(), scraped);
    return { textNotes: raw.trim(), shipping };
  }
  const textNotes = raw.slice(0, idx).replace(/\n+$/, "").trim();
  let block = raw.slice(idx + SHIPPING_NOTES_MARKER.length).replace(/^\n+/, "");
  const nestedIdx = NESTED_NOTE_MARKERS.reduce((best, marker) => {
    const at = block.indexOf(marker);
    return at !== -1 && (best === -1 || at < best) ? at : best;
  }, -1);
  if (nestedIdx !== -1) block = block.slice(0, nestedIdx).replace(/\n+$/, "");

  const shipping = mergeShippingFields(parseShippingBlock(block), scrapeCourierServiceFromText(textNotes));
  return { textNotes, shipping };
}

/** Gabungkan blok pengiriman dari beberapa sumber notes (invoice vs SO). */
export function mergeShippingFromNotes(...rawNotesList: (string | null | undefined)[]): ShippingInfo {
  let merged = emptyShippingInfo();
  for (const raw of rawNotesList) {
    if (!raw?.trim()) continue;
    const { shipping } = parseNotesWithShipping(raw);
    merged = mergeShippingFields(merged, shipping);
  }
  if (hasShippingData(merged)) merged.enabled = true;
  return merged;
}

export type ResolveShippingOpts = {
  /** JSON POS [[POS_META]] — fallback kurir/layanan. */
  posShipping?: {
    courier?: string;
    service?: string;
    awb?: string;
    address?: string;
  } | null;
  /** outbound_workflow_json SO — fallback kurir/alamat. */
  workflowCourier?: string | null;
  workflowAddress?: string | null;
};

/** Muat info pengiriman lengkap untuk form preview/edit. */
export function resolveShippingFromNotes(
  rawNotes?: string | null,
  opts?: ResolveShippingOpts,
): ShippingInfo {
  let shipping = parseNotesWithShipping(rawNotes).shipping;

  if (opts?.posShipping) {
    shipping = mergeShippingFields(shipping, {
      courier: opts.posShipping.courier,
      shipping_service: opts.posShipping.service,
      tracking_no: opts.posShipping.awb,
      recipient_address: opts.posShipping.address,
    });
  }
  if (opts?.workflowCourier || opts?.workflowAddress) {
    shipping = mergeShippingFields(shipping, {
      courier: opts.workflowCourier ?? undefined,
      recipient_address: opts.workflowAddress ?? undefined,
    });
  }
  if (hasShippingData(shipping)) shipping.enabled = true;
  return enrichShippingFromCatalog(shipping);
}

export function loadShippingForForm(
  sources: Array<{ notes?: string | null; opts?: ResolveShippingOpts }>,
): ShippingInfo {
  let merged = emptyShippingInfo();
  for (const src of sources) {
    if (src.notes?.trim()) {
      merged = mergeShippingFields(merged, resolveShippingFromNotes(src.notes, src.opts));
    } else if (src.opts) {
      merged = mergeShippingFields(merged, resolveShippingFromNotes(undefined, src.opts));
    }
  }
  if (hasShippingData(merged)) merged.enabled = true;
  return enrichShippingFromCatalog(merged);
}

/** Gabungkan pesan/memo dengan info pengiriman (jika aktif). */
export function buildNotesWithShipping(
  textNotes: string | undefined,
  shipping: ShippingInfo,
): string | undefined {
  const normalized = normalizeShippingForSave(shipping);
  const base = (textNotes ?? "").trim();
  if (!normalized.enabled || !hasShippingData(normalized)) {
    return base || undefined;
  }
  const courier = normalized.courier.trim();
  const service = normalized.shipping_service.trim();
  const tracking = normalized.tracking_no.trim();
  const recipientAddress = normalized.recipient_address.trim();
  const shipCost = Math.max(0, Number(normalized.shipping_cost) || 0);
  const block =
    `${SHIPPING_NOTES_MARKER}\n` +
    `Expedisi: ${courier}\n` +
    `Layanan: ${service}\n` +
    `Nomor lacak: ${tracking}\n` +
    `Ongkir: ${shipCost}\n` +
    `Alamat penerima: ${recipientAddress}`;
  return base ? `${base}\n${block}` : block;
}

export function formatShippingDisplay(shipping: ShippingInfo): string | null {
  if (!isShippingActive(shipping)) return null;
  const parts: string[] = [];
  if (shipping.courier.trim()) parts.push(`Expedisi: ${shipping.courier.trim()}`);
  if (shipping.shipping_service.trim()) {
    parts.push(`Layanan: ${shipping.shipping_service.trim()}`);
  }
  if (shipping.tracking_no.trim()) parts.push(`Nomor lacak: ${shipping.tracking_no.trim()}`);
  if ((shipping.shipping_cost ?? 0) > 0) {
    parts.push(`Ongkir: Rp ${new Intl.NumberFormat("id-ID").format(shipping.shipping_cost)}`);
  }
  if (shipping.recipient_address.trim()) {
    parts.push(`Alamat: ${shipping.recipient_address.trim()}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
