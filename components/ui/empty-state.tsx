import { Loader2, ShieldOff, Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/design/cn";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-erp-border bg-erp-surface-muted px-6 py-10 text-center",
        className,
      )}
    >
      <Icon className="mx-auto h-10 w-10 text-erp-text-subtle" strokeWidth={1.5} />
      <p className="mt-3 font-medium text-erp-text">{title}</p>
      {description ? <p className="mt-1 text-sm text-erp-text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-erp-text-muted", className)}>
      <Loader2 className="h-5 w-5 animate-spin" />
      {label ?? "Memuat…"}
    </div>
  );
}

export function ErrorState({
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
    <div className={cn("rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800", className)}>
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function PermissionDeniedState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-erp-border bg-erp-surface px-6 py-10 text-center",
        className,
      )}
      role="alert"
    >
      <ShieldOff className="h-10 w-10 text-erp-text-subtle" strokeWidth={1.5} />
      <p className="mt-3 font-medium text-erp-text">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-erp-text-muted">{description}</p> : null}
    </div>
  );
}
