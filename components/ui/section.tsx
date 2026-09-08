import { cn } from "@/lib/design/cn";

export function Section({
  title,
  children,
  className,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-erp-text-muted">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
