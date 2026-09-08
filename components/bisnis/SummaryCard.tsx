const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(v);

export function SummaryCard({
  label,
  count,
  amount,
  color,
  hint,
}: {
  label: string;
  count: number;
  amount: number;
  color: "orange" | "red" | "green";
  hint?: string;
}) {
  const accent = {
    orange: {
      bar: "bg-amber-500",
      count: "bg-amber-100 text-amber-900",
      amount: "text-slate-900",
    },
    red: {
      bar: "bg-rose-500",
      count: "bg-rose-100 text-rose-900",
      amount: "text-slate-900",
    },
    green: {
      bar: "bg-emerald-500",
      count: "bg-emerald-100 text-emerald-900",
      amount: "text-slate-900",
    },
  }[color];

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-1.5 text-xl font-bold tabular-nums tracking-tight ${accent.amount}`}>
            {fmt(amount)}
          </p>
          {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
        </div>
        <span
          className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-bold tabular-nums ${accent.count}`}
          title={`${count} dokumen`}
        >
          {count}
        </span>
      </div>
    </div>
  );
}
