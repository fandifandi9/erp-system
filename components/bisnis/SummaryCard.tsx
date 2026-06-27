const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

export function SummaryCard({
  label,
  count,
  amount,
  color,
}: {
  label: string;
  count: number;
  amount: number;
  color: "orange" | "red" | "green";
}) {
  const styles = {
    orange: "border-l-orange-400 bg-orange-50",
    red: "border-l-red-400 bg-red-50",
    green: "border-l-emerald-400 bg-emerald-50",
  };
  const countBg = {
    orange: "bg-orange-400",
    red: "bg-red-400",
    green: "bg-emerald-400",
  };
  return (
    <div className={`rounded-lg border border-slate-200 border-l-4 p-4 ${styles[color]}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span
          className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${countBg[color]}`}
        >
          {count}
        </span>
      </div>
      <div className="text-lg font-bold text-slate-900">{fmt(amount)}</div>
    </div>
  );
}
