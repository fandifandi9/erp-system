/** Input dari wedge scanner — auto-submit tanpa tombol Enter. */
export function shouldAutoSubmitScan(code: string): boolean {
  const t = code.trim();
  if (t.length < 4) return false;
  if (/\s/.test(t)) return false;
  if (/^\d{6,}$/.test(t)) return true;
  if (/^[A-Za-z0-9][A-Za-z0-9\-_.]{2,}$/.test(t)) return true;
  return false;
}

export function autoSubmitDelayMs(code: string): number {
  const t = code.trim();
  return /^\d{6,}$/.test(t) ? 50 : 120;
}
