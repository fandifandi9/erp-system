"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Loader2 } from "lucide-react";

/** Kartu premium — glass ringan di atas bg slate-50 */
export function WmsCard({
  children,
  className = "",
  hover = false,
  padding = "p-5",
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: string;
}) {
  return (
    <div
      className={
        "rounded-2xl border border-slate-200/90 bg-white/90 shadow-lg shadow-slate-200/40 backdrop-blur-sm " +
        padding +
        " " +
        (hover ? "transition hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/30 " : "") +
        className
      }
    >
      {children}
    </div>
  );
}

export function WmsStatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  accent = "indigo",
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  href?: string;
  accent?: "indigo" | "emerald" | "amber" | "violet";
  warn?: boolean;
}) {
  const accentMap = {
    indigo: "from-indigo-500/10 to-indigo-600/5 text-indigo-600",
    emerald: "from-emerald-500/10 to-emerald-600/5 text-emerald-600",
    amber: "from-amber-500/10 to-amber-600/5 text-amber-600",
    violet: "from-violet-500/10 to-violet-600/5 text-violet-600",
  };
  const inner = (
    <WmsCard
      hover={!!href}
      className={warn ? "border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-white" : ""}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br " +
            accentMap[accent]
          }
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        {href ? <ChevronRight className="h-4 w-4 text-slate-300" /> : null}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {sub ? <p className="mt-1 text-sm text-slate-500">{sub}</p> : null}
    </WmsCard>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function WmsBadge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "emerald" | "amber" | "indigo" | "red" | "violet";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200/80",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
    amber: "bg-amber-50 text-amber-900 ring-amber-200/80",
    indigo: "bg-indigo-50 text-indigo-800 ring-indigo-200/80",
    red: "bg-red-50 text-red-800 ring-red-200/80",
    violet: "bg-violet-50 text-violet-800 ring-violet-200/80",
  };
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset " +
        tones[tone]
      }
    >
      {children}
    </span>
  );
}

export function WmsSectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function WmsNavTile({
  href,
  label,
  description,
  icon: Icon,
  accent = "indigo",
}: {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  accent?: "indigo" | "emerald" | "amber" | "violet" | "cyan";
}) {
  const accents = {
    indigo: "group-hover:border-indigo-300 group-hover:shadow-indigo-100/50",
    emerald: "group-hover:border-emerald-300 group-hover:shadow-emerald-100/50",
    amber: "group-hover:border-amber-300 group-hover:shadow-amber-100/50",
    violet: "group-hover:border-violet-300 group-hover:shadow-violet-100/50",
    cyan: "group-hover:border-cyan-300 group-hover:shadow-cyan-100/50",
  };
  const iconBg = {
    indigo: "bg-indigo-100 text-indigo-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    violet: "bg-violet-100 text-violet-700",
    cyan: "bg-cyan-100 text-cyan-800",
  };
  return (
    <Link
      href={href}
      className={
        "group block rounded-2xl border border-slate-200/90 bg-white p-4 shadow-md shadow-slate-200/30 transition " +
        accents[accent]
      }
    >
      <div className="flex items-start gap-3">
        <div className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + iconBg[accent]}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{label}</p>
          {description ? <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{description}</p> : null}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
      </div>
    </Link>
  );
}

export function WmsFlowBar({
  steps,
  activeIndex = -1,
}: {
  steps: readonly { label: string; color: string }[];
  activeIndex?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1 sm:gap-2">
          <div
            className={
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-sm " +
              s.color +
              (i <= activeIndex ? " ring-2 ring-white/50 ring-offset-1 ring-offset-slate-900" : " opacity-70")
            }
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
              {i + 1}
            </span>
            {s.label}
          </div>
          {i < steps.length - 1 ? (
            <ChevronRight className="hidden h-4 w-4 text-slate-400 sm:block" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function WmsHero({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-5 py-6 text-white shadow-xl shadow-slate-900/20 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-cyan-400/10 blur-2xl" />
      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-300">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm text-slate-300">{subtitle}</p> : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </div>
  );
}

export function WmsLoading({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function WmsEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <WmsCard className="text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </WmsCard>
  );
}

export function WmsChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const cls =
    "rounded-xl px-3 py-2 text-sm font-medium transition " +
    (active
      ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
      : "bg-slate-100 text-slate-700 hover:bg-slate-200");
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {children}
      </button>
    );
  }
  return <span className={cls}>{children}</span>;
}

export function WmsStickyActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function WmsPrimaryButton({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200/50 transition hover:bg-indigo-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function WmsSecondaryButton({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
