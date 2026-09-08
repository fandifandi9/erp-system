"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/hr/rating", label: "Dasbor", exact: true },
  { href: "/hr/rating/periods", label: "Periode" },
  { href: "/hr/rating/assignments", label: "Assignment" },
  { href: "/hr/rating/results", label: "Hasil" },
  { href: "/hr/rating/tasks", label: "Tugas saya" },
  { href: "/hr/rating/my-result", label: "Hasil saya" },
];

export function RatingModuleNav() {
  const pathname = usePathname() || "";
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
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
