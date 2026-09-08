"use client";

import { cn } from "@/lib/design/cn";

export type TabItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-erp-border", className)} role="tablist">
      <div className="flex gap-1 overflow-x-auto">
        {items.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={cn(
                "shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                active
                  ? "border-indigo-600 text-erp-text"
                  : "border-transparent text-erp-text-muted hover:text-erp-text",
                tab.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TabPanel({
  id,
  activeId,
  children,
  className,
}: {
  id: string;
  activeId: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (id !== activeId) return null;
  return (
    <div role="tabpanel" className={cn("pt-4", className)}>
      {children}
    </div>
  );
}
