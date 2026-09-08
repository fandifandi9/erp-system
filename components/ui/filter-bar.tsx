"use client";

import { cn } from "@/lib/design/cn";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  onReset,
  resetLabel,
  children,
  className,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onReset?: () => void;
  resetLabel?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-erp-border bg-erp-surface p-3 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      {onSearchChange ? (
        <div className="w-full min-w-[12rem] flex-1 sm:max-w-xs">
          <SearchInput
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            onClear={search ? () => onSearchChange("") : undefined}
          />
        </div>
      ) : null}
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      {onReset ? (
        <Button variant="ghost" size="sm" onClick={onReset} className="sm:ml-auto">
          {resetLabel ?? "Reset"}
        </Button>
      ) : null}
    </div>
  );
}
