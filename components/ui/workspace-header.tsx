import { cn } from "@/lib/design/cn";
import { EntityBrandMark } from "@/components/ui/entity-brand-mark";

export function WorkspaceHeader({
  title,
  subtitle,
  entityName,
  entityLogoUrl,
  compact = false,
  className,
}: {
  title: string;
  subtitle?: string;
  entityName?: string;
  entityLogoUrl?: string | null;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start gap-3", compact && "gap-2", className)}>
      {entityName ? (
        <EntityBrandMark name={entityName} logoUrl={entityLogoUrl} size={compact ? "md" : "lg"} />
      ) : null}
      <div className="min-w-0 flex-1">
        {entityName ? (
          <p className={cn("font-semibold text-erp-text", compact ? "text-xs" : "text-sm")}>
            {entityName}
          </p>
        ) : null}
        <h1
          className={cn(
            "font-bold tracking-tight text-erp-text",
            compact ? "text-lg leading-tight" : "text-2xl",
            entityName && "mt-0.5",
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className={cn("text-erp-text-muted", compact ? "mt-0.5 text-xs" : "mt-1 text-sm")}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
