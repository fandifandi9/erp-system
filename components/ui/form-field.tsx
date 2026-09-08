"use client";

import { cn } from "@/lib/design/cn";
import { Label } from "@/components/ui/label";

export function FormField({
  label,
  htmlFor,
  required,
  helper,
  error,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {helper && !error ? <p className="text-xs text-erp-text-muted">{helper}</p> : null}
      {error ? <p className="text-xs text-erp-danger">{error}</p> : null}
    </div>
  );
}
