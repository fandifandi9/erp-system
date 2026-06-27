import type { PosMeta, PosSaleMode } from "@/lib/pos/types";

const PREFIX = "[[POS_META]]";

export function buildPosNotes(
  meta: PosMeta & { cashier_user_id?: string },
  extra?: string,
): string {
  const block = `${PREFIX}${JSON.stringify(meta)}`;
  if (!extra?.trim()) return block;
  return `${block}\n\n${extra.trim()}`;
}

export function parsePosNotes(notes?: string | null): PosMeta | null {
  if (!notes?.includes(PREFIX)) return null;
  const start = notes.indexOf(PREFIX) + PREFIX.length;
  const end = notes.indexOf("\n\n", start);
  const json = (end === -1 ? notes.slice(start) : notes.slice(start, end)).trim();
  try {
    const o = JSON.parse(json) as PosMeta;
    if (o?.pos && (o.mode === "direct" || o.mode === "wms")) return o;
  } catch {
    /* ignore */
  }
  return null;
}

/** Hapus blok metadata POS — untuk tampilan catatan dokumen / cetak. */
export function stripPosMetaFromNotes(notes?: string | null): string {
  if (!notes?.trim()) return "";
  if (!notes.includes(PREFIX)) return notes.trim();
  const start = notes.indexOf(PREFIX);
  const afterPrefix = start + PREFIX.length;
  const end = notes.indexOf("\n\n", afterPrefix);
  const before = notes.slice(0, start).trim();
  const after = end === -1 ? "" : notes.slice(end + 2).trim();
  return [before, after].filter(Boolean).join("\n\n").trim();
}

/** Catatan manusiawi untuk dokumen bisnis (tanpa JSON mentah). */
export function formatPosNotesForDisplay(notes?: string | null): string | undefined {
  const meta = parsePosNotes(notes);
  const body = stripPosMetaFromNotes(notes);
  if (!meta && !body) return undefined;
  if (!meta) return body || undefined;
  const header = `Sumber: Kasir POS (${posModeLabel(meta.mode)})`;
  if (meta.register_name) {
    const lines = [header, `Terminal: ${meta.register_name}`];
    if (body) lines.push(body);
    return lines.join("\n");
  }
  return body ? `${header}\n${body}` : header;
}

export function posModeLabel(mode: PosSaleMode): string {
  return mode === "direct" ? "Penjualan langsung (stok POS)" : "Marketplace / WMS";
}
