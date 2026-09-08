"use client";

import Link from "next/link";

type Tab = {
  href: string;
  label: string;
  active: boolean;
};

export function DocTypeTabs({ tabs }: { tabs: Tab[] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={
            "inline-flex border-b-2 px-4 py-2 text-sm font-medium transition -mb-px " +
            (tab.active
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800")
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
