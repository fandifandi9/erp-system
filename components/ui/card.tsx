import { cn } from "@/lib/design/cn";

export function Card({
  children,
  className,
  hover = false,
  padding = "p-5",
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-erp-border bg-erp-surface shadow-sm",
        padding,
        hover && "transition hover:border-indigo-200 hover:shadow-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div>
        <h3 className="text-sm font-semibold text-erp-text">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-erp-text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
