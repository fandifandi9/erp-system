"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";

const LINKS = [
  { href: "/hr/rating", labelKey: "hr.rating.nav.dashboard", exact: true },
  { href: "/hr/rating/periods", labelKey: "hr.rating.nav.periods" },
  { href: "/hr/rating/assignments", labelKey: "hr.rating.nav.assignments" },
  { href: "/hr/rating/results", labelKey: "hr.rating.nav.results" },
  { href: "/hr/rating/tasks", labelKey: "hr.rating.nav.tasks" },
  { href: "/hr/rating/my-result", labelKey: "hr.rating.nav.myResult" },
];

export function RatingModuleNav() {
  const pathname = usePathname() || "";
  const { t } = useLocale();
  return (
    <nav className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-slate-200 pb-3">
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm ${
              active
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {t(l.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
