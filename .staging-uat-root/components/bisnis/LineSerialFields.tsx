"use client";

type Props = {
  qty: number;
  serials: string[];
  onChange: (serials: string[]) => void;
  compact?: boolean;
  lineIdx?: number;
};

/** Input SN per unit untuk produk wajib serial. */
export function LineSerialFields({ qty, serials, onChange, compact, lineIdx = 0 }: Props) {
  if (qty <= 0) return null;
  const cls = compact
    ? "w-full rounded border border-amber-200 px-2 py-1 font-mono text-xs"
    : "w-full rounded border border-amber-200 px-2 py-1.5 font-mono text-sm";

  const onSerialKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, unitIdx: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = document.querySelector<HTMLElement>(
      `[data-sn-line="${lineIdx}"][data-sn-unit="${unitIdx + 1}"]`,
    );
    if (next && next.offsetParent !== null) next.focus();
  };

  return (
    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: qty }, (_, i) => (
        <input
          key={i}
          data-sn-line={lineIdx}
          data-sn-unit={i}
          className={cls}
          placeholder={`SN unit ${i + 1}`}
          value={serials[i] ?? ""}
          onChange={(e) => {
            const next = [...serials];
            while (next.length < qty) next.push("");
            next[i] = e.target.value;
            onChange(next);
          }}
          onKeyDown={(e) => onSerialKeyDown(e, i)}
        />
      ))}
    </div>
  );
}
