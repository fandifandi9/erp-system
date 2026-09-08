"use client";

import { cn } from "@/lib/design/cn";

export type AttendanceChartSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export type AttendanceTrendPoint = {
  day: number;
  present: number;
  leave: number;
  sick: number;
  alpha: number;
};

function DonutRing({
  segments,
  total,
  centerTop,
  centerBottom,
}: {
  segments: AttendanceChartSegment[];
  total: number;
  centerTop: string;
  centerBottom: string;
}) {
  const safeTotal = Math.max(total, 1);
  let cursor = 0;
  const stops = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const start = (cursor / safeTotal) * 100;
      cursor += s.value;
      const end = (cursor / safeTotal) * 100;
      return `${s.color} ${start}% ${end}%`;
    });

  const gradient =
    stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(#e2e8f0 0% 100%)";

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-28 w-28 shrink-0">
        <div className="h-full w-full rounded-full" style={{ background: gradient }} />
        <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white text-center">
          <p className="text-lg font-bold leading-none text-erp-text">{centerTop}</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-erp-text-muted">
            {centerBottom}
          </p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {segments.map((s) => {
          const pct = safeTotal > 0 ? Math.round((s.value / safeTotal) * 100) : 0;
          return (
            <li key={s.key} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="truncate text-erp-text">{s.label}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums text-erp-text">
                {s.value}{" "}
                <span className="text-erp-text-muted">({pct}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TrendLines({ series, labels }: { series: AttendanceTrendPoint[]; labels: Record<string, string> }) {
  if (series.length === 0) return null;

  const width = 320;
  const height = 140;
  const pad = { t: 8, r: 8, b: 20, l: 28 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxY = Math.max(
    1,
    ...series.flatMap((p) => [p.present, p.leave, p.sick, p.alpha]),
  );

  const x = (i: number) => pad.l + (i / Math.max(series.length - 1, 1)) * innerW;
  const y = (v: number) => pad.t + innerH - (v / maxY) * innerH;

  const line = (key: keyof Omit<AttendanceTrendPoint, "day">, color: string) => {
    const d = series
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`)
      .join(" ");
    return <path key={key} d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />;
  };

  const ticks = series.length <= 8 ? series : series.filter((_, i) => i % Math.ceil(series.length / 7) === 0 || i === series.length - 1);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full min-w-[280px]">
        {[0, 0.5, 1].map((f) => {
          const gy = pad.t + innerH * (1 - f);
          return (
            <line
              key={f}
              x1={pad.l}
              x2={width - pad.r}
              y1={gy}
              y2={gy}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          );
        })}
        {line("present", "#10b981")}
        {line("leave", "#eab308")}
        {line("sick", "#3b82f6")}
        {line("alpha", "#ef4444")}
        {ticks.map((p) => (
          <text
            key={p.day}
            x={x(series.indexOf(p))}
            y={height - 4}
            textAnchor="middle"
            className="fill-slate-400 text-[9px]"
          >
            {p.day}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-erp-text-muted">
        {(
          [
            ["present", "#10b981"],
            ["leave", "#eab308"],
            ["sick", "#3b82f6"],
            ["alpha", "#ef4444"],
          ] as const
        ).map(([key, color]) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span className="h-1.5 w-3 rounded-full" style={{ backgroundColor: color }} />
            {labels[key]}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StaffAttendanceSummaryChart({
  segments,
  total,
  monthLabel,
  dataAsOf,
  totalDaysLabel,
  className,
}: {
  segments: AttendanceChartSegment[];
  total: number;
  monthLabel: string;
  dataAsOf?: string;
  totalDaysLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <DonutRing segments={segments} total={total} centerTop={String(total)} centerBottom={totalDaysLabel} />
      {dataAsOf ? (
        <p className="text-[10px] text-erp-text-muted">
          {monthLabel} · {dataAsOf}
        </p>
      ) : null}
    </div>
  );
}

export function StaffAttendanceTrendChart({
  series,
  monthLabel,
  labels,
  className,
}: {
  series: AttendanceTrendPoint[];
  monthLabel: string;
  labels: Record<string, string>;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[10px] font-medium text-erp-text-muted">{monthLabel}</p>
      <TrendLines series={series} labels={labels} />
    </div>
  );
}
