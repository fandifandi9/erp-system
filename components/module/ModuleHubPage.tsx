"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

export type HubLink = {
  href?: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  comingSoon?: boolean;
};

export type HubStat = {
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
};

type ModuleHubPageProps = {
  title: string;
  subtitle?: string;
  stats?: HubStat[];
  links: HubLink[];
};

export function ModuleHubPage({ title, subtitle, stats, links }: ModuleHubPageProps) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>

      {stats && stats.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " + s.color}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="truncate text-lg font-bold text-slate-900">{s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => {
          const inner = (
            <>
              <div className="flex items-center gap-3">
                <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " + l.color}>
                  <l.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{l.label}</p>
                  <p className="text-xs text-slate-500">{l.description}</p>
                </div>
                {!l.comingSoon ? (
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-indigo-500" />
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Segera
                  </span>
                )}
              </div>
            </>
          );

          if (l.comingSoon || !l.href) {
            return (
              <div
                key={l.label}
                className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-5 opacity-75"
              >
                {inner}
              </div>
            );
          }

          return (
            <Link
              key={`${l.href}::${l.label}`}
              href={l.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
