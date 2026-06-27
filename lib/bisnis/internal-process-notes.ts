/** Catatan proses internal (pemrosesan → WMS) — disimpan di notes, tidak dicetak di invoice. */
export const INTERNAL_PROCESS_MARKER = "---catatan-proses-internal---";

export function buildNotesWithInternalProcess(
  textNotes: string | undefined,
  internal: string | undefined,
): string | undefined {
  const base = (textNotes ?? "").trim();
  const body = (internal ?? "").trim();
  if (!body) return base || undefined;
  const block = `${INTERNAL_PROCESS_MARKER}\n${body}`;
  return base ? `${base}\n\n${block}` : block;
}

export function parseNotesWithInternalProcess(raw?: string | null): {
  textNotes: string;
  internal: string;
} {
  if (!raw?.trim()) return { textNotes: "", internal: "" };
  const idx = raw.indexOf(INTERNAL_PROCESS_MARKER);
  if (idx === -1) return { textNotes: raw.trim(), internal: "" };
  const textNotes = raw.slice(0, idx).replace(/\n+$/, "").trim();
  const internal = raw
    .slice(idx + INTERNAL_PROCESS_MARKER.length)
    .replace(/^\n+/, "")
    .trim();
  return { textNotes, internal };
}
