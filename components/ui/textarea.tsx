"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/design/cn";
import { fieldControlClass, fieldControlInvalidClass } from "@/lib/design/field-styles";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldControlClass, "min-h-[5rem] resize-y", invalid && fieldControlInvalidClass, className)}
      {...props}
    />
  );
});
