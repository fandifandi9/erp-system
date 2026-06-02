const REF_LINE = /^Ref:\s*(.+)$/;

/** Sisipkan nomor referensi eksternal (faktur supplier, pesanan MP, dll.) di baris pertama catatan. */
export function prependReferenceToNotes(notes: string, refNo?: string): string {
  const ref = refNo?.trim();
  const body = stripReferenceFromNotes(notes);
  if (!ref) return body;
  const header = `Ref: ${ref}`;
  return body ? `${header}\n${body}` : header;
}

export function stripReferenceFromNotes(notes?: string): string {
  if (!notes?.trim()) return "";
  const lines = notes.split("\n");
  if (REF_LINE.test(lines[0]?.trim() ?? "")) {
    return lines.slice(1).join("\n").trim();
  }
  return notes.trim();
}

export function parseReferenceFromNotes(notes?: string): {
  reference: string;
  body: string;
} {
  if (!notes?.trim()) return { reference: "", body: "" };
  const lines = notes.split("\n");
  const first = lines[0]?.trim() ?? "";
  const m = first.match(REF_LINE);
  if (m) {
    return {
      reference: m[1].trim(),
      body: lines.slice(1).join("\n").trim(),
    };
  }
  return { reference: "", body: notes.trim() };
}
