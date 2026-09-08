import { cn } from "@/lib/design/cn";

export function WorkspaceLayout({
  header,
  kpis,
  alerts,
  quickActions,
  children,
  footer,
  className,
  maxWidth = "max-w-7xl",
}: {
  header: React.ReactNode;
  kpis?: React.ReactNode;
  alerts?: React.ReactNode;
  quickActions?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <div className={cn("mx-auto w-full", maxWidth, className ?? "space-y-6 p-4 sm:p-6")}>
      {header}
      {kpis ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{kpis}</div> : null}
      {alerts}
      {quickActions ? <div className="space-y-3">{quickActions}</div> : null}
      {children}
      {footer}
    </div>
  );
}
