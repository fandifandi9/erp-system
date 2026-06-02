"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";

type SidebarAccordionSectionProps = {
  title: string;
  /** Buka otomatis saat halaman aktif di section ini */
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Sub-menu di dalam section (lebih kecil) */
  compact?: boolean;
};

export function SidebarAccordionSection({
  title,
  active = false,
  children,
  className = "",
  compact = false,
}: SidebarAccordionSectionProps) {
  const panelId = useId();
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <div className={"border-b border-slate-800/70 last:border-b-0 " + className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={
          "flex w-full items-center justify-between gap-2 rounded-lg px-2 text-left transition " +
          (compact ? "py-1.5" : "py-2.5") +
          " " +
          (open || active
            ? "bg-slate-800/50 text-white"
            : "text-slate-300 hover:bg-slate-800/40 hover:text-white")
        }
      >
        <span
          className={
            compact
              ? "text-[10px] font-bold uppercase tracking-wider"
              : "text-xs font-bold uppercase tracking-wide"
          }
        >
          {title}
        </span>
        <ChevronDown
          className={
            "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 " +
            (open ? "rotate-180" : "")
          }
          strokeWidth={2}
        />
      </button>
      {open ? (
        <div id={panelId} className="space-y-1 pb-3 pl-1 pr-0.5 pt-1">
          {children}
        </div>
      ) : null}
    </div>
  );
}
