import { cn } from "@/lib/design/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const toneClass: Record<BadgeTone, string> = {
  neutral: "bg-erp-surface-muted text-erp-text-muted ring-erp-border",
  success: "bg-erp-success-soft text-emerald-800 ring-emerald-200",
  warning: "bg-erp-warning-soft text-amber-900 ring-amber-200",
  danger: "bg-erp-danger-soft text-red-800 ring-red-200",
  info: "bg-erp-info-soft text-sky-800 ring-sky-200",
  brand: "bg-erp-primary-soft text-erp-primary-foreground ring-indigo-200",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Semantic status badge — always includes visible text label. */
export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
