"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/design/cn";
import { fieldControlClass, fieldControlInvalidClass } from "@/lib/design/field-styles";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(fieldControlClass, invalid && fieldControlInvalidClass, className)}
      {...props}
    >
      {children}
    </select>
  );
});
