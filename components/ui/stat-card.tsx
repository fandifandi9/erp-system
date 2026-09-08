import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/design/cn";

export function WorkspaceNavItem({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-erp-border bg-erp-surface px-3 py-2.5 transition hover:border-indigo-200 hover:bg-erp-surface-muted"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-erp-surface-muted text-erp-text group-hover:bg-erp-primary-soft group-hover:text-indigo-700">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-erp-text">{title}</p>
        {description ? <p className="mt-0.5 truncate text-xs text-erp-text-muted">{description}</p> : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-erp-text-subtle" aria-hidden />
    </Link>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  href?: string;
  className?: string;
}) {
  const inner = (
    <Card hover={!!href} className={className}>
      <div className="flex items-start justify-between gap-2">
        {Icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-erp-primary-soft text-erp-primary-foreground">
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
        ) : null}
        {href ? <ChevronRight className="h-4 w-4 text-erp-text-subtle" /> : null}
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-erp-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-erp-text">{value}</p>
      {sub ? <p className="mt-1 text-sm text-erp-text-muted">{sub}</p> : null}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function QuickAction({
  href,
  icon: Icon,
  label,
  description,
  onClick,
  className,
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  description?: string;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <Card hover className={cn("h-full", className)}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-erp-surface-muted text-erp-text">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-erp-text">{label}</p>
          {description ? <p className="mt-0.5 text-sm text-erp-text-muted">{description}</p> : null}
        </div>
      </div>
    </Card>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {content}
    </button>
  );
}

export function WorkspaceShortcut({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return <QuickAction href={href} icon={Icon} label={title} description={description} />;
}
