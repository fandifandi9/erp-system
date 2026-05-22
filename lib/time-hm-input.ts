/**
 * Input jam 24 jam formal **HH:mm** (tanda ":" tetap).
 * Dipakai PWA & native agar mengetik konsisten.
 */

/** Saat mengetik: hanya angka, maks. 4 digit, sisipkan ":" setelah jam (contoh 930 → 09:30). */
export function filterTimeHmTyping(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

function pad2(n: number): string {
  return String(Math.max(0, n)).padStart(2, "0");
}

/**
 * Setelah blur / sebelum kirim: selalu **HH:mm** (contoh 9:5 → 09:05, 18 → 18:00).
 * String kosong tetap kosong.
 */
export function formalizeTimeHmInput(raw: string): string {
  const s = raw.trim();
  if (!s) return "";

  if (s.includes(":")) {
    const [a, b = ""] = s.split(":");
    const hStr = a.replace(/\D/g, "").slice(0, 2);
    const mStr = b.replace(/\D/g, "").slice(0, 2);
    if (!hStr) return "";
    const h = Math.min(23, parseInt(hStr.length === 1 ? `0${hStr}` : hStr.slice(0, 2), 10));
    const m =
      mStr === ""
        ? 0
        : Math.min(59, parseInt(mStr.padStart(2, "0").slice(0, 2), 10));
    return `${pad2(h)}:${pad2(m)}`;
  }

  const d = s.replace(/\D/g, "").slice(0, 4);
  if (d.length === 0) return "";

  let h: number;
  let m: number;
  if (d.length <= 2) {
    h = Math.min(23, parseInt(d.padStart(2, "0").slice(0, 2), 10));
    m = 0;
  } else if (d.length === 3) {
    h = Math.min(23, parseInt(d[0]!, 10));
    m = Math.min(59, parseInt(d.slice(1).padStart(2, "0"), 10));
  } else {
    h = Math.min(23, parseInt(d.slice(0, 2), 10));
    m = Math.min(59, parseInt(d.slice(2, 4), 10));
  }
  return `${pad2(h)}:${pad2(m)}`;
}

/** Nilai `<input type="time" />` → HH:mm (buang detik jika ada). */
export function coerceBrowserTimeToHm(v: string): string {
  if (!v) return "";
  const t = v.trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return formalizeTimeHmInput(t);
  return formalizeTimeHmInput(`${m[1]}:${m[2]}`);
}
