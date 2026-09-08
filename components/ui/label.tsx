import { cn } from "@/lib/design/cn";

export function Label({
  children,
  className,
  required,
  htmlFor,
}: {
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-sm font-medium text-erp-text", className)}>
      {children}
      {required ? <span className="ml-0.5 text-erp-danger">*</span> : null}
    </label>
  );
}
