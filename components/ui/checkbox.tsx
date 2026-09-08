"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/design/cn";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-erp-border text-indigo-600 focus:ring-2 focus:ring-[color:var(--erp-focus-ring)]/30",
        className,
      )}
      {...props}
    />
  );
});
