"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/design/cn";
import { fieldControlClass, fieldControlInvalidClass } from "@/lib/design/field-styles";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(fieldControlClass, invalid && fieldControlInvalidClass, className)}
      {...props}
    />
  );
});
