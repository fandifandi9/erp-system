import { cn } from "@/lib/design/cn";

/** Sticky form/page action bar — single primary action pattern. */
export function ActionBar({
  children,
  className,
  align = "end",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "end" | "between";
}) {
  const alignClass =
    align === "start" ? "justify-start" : align === "between" ? "justify-between" : "justify-end";
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-6 flex flex-wrap gap-2 border-t border-erp-border bg-erp-surface/95 px-6 py-4 backdrop-blur-sm",
        alignClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
