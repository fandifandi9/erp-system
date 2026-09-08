import { cn } from "@/lib/design/cn";

export function PageShell({
  header,
  filter,
  summary,
  children,
  pagination,
  footer,
  className,
  maxWidth = "max-w-7xl",
}: {
  header?: React.ReactNode;
  filter?: React.ReactNode;
  summary?: React.ReactNode;
  children: React.ReactNode;
  pagination?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-6 p-6", maxWidth, className)}>
      {header}
      {filter}
      {summary}
      {children}
      {pagination}
      {footer}
    </div>
  );
}
