/** Penanda mutasi stok dari modul bisnis (tanpa wajib field reference_id di PB). */
export function buildBizStockNote(
  referenceType: string,
  referenceId: string,
  referenceNo: string,
): string {
  return `BIZ:${referenceType}:${referenceId}:${referenceNo}`;
}

export function bizStockNoteMatches(
  notes: string | undefined,
  opts: { referenceId?: string; referenceType?: string; referenceNo?: string },
): boolean {
  const text = String(notes || "");
  if (!text) return false;

  const { referenceId, referenceType, referenceNo } = opts;
  if (referenceId && referenceType) {
    const token = `BIZ:${referenceType}:${referenceId}:`;
    if (text.includes(token)) return true;
  }

  if (referenceNo) {
    if (text.includes(`:${referenceNo}`)) return true;
    if (text.includes(`Auto: ${referenceNo}`)) return true;
  }

  return !!referenceId && text.includes(referenceId);
}
