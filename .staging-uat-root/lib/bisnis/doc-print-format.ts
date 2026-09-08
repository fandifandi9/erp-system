export const bizDocFmtMoney = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(v);

/** Parse tanggal PocketBase (YYYY-MM-DD atau datetime dengan spasi). */
export function parseBizDateInput(d?: string | null): Date | null {
  if (!d?.trim()) return null;
  const s = d.trim();
  const ymd = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const dt = new Date(`${ymd}T12:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export const bizDocFmtDate = (d?: string | null) => {
  const dt = parseBizDateInput(d);
  return dt
    ? dt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "—";
};

/** Format pendek untuk halaman pratinjau publik. */
export const bizDocFmtDateShort = (d?: string | null) => {
  const dt = parseBizDateInput(d);
  return dt
    ? dt.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";
};

export const bizDocFmtNum = (v: number) => new Intl.NumberFormat("id-ID").format(v);
