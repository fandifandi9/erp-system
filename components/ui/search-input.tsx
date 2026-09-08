"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/design/cn";
import { fieldControlClass } from "@/lib/design/field-styles";

export type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  onClear?: () => void;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, onClear, value, ...props },
  ref,
) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-erp-text-subtle" />
      <input
        ref={ref}
        type="search"
        value={value}
        className={cn(fieldControlClass, "pl-9")}
        {...props}
      />
      {onClear && value ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-erp-text-muted hover:text-erp-text"
        >
          ×
        </button>
      ) : null}
    </div>
  );
});
