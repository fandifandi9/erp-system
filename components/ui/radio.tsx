"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/design/cn";

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="radio"
      className={cn(
        "h-4 w-4 border-erp-border text-indigo-600 focus:ring-2 focus:ring-[color:var(--erp-focus-ring)]/30",
        className,
      )}
      {...props}
    />
  );
});
