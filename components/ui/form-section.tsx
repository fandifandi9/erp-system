import { cn } from "@/lib/design/cn";
import { SectionHeader } from "@/components/ui/section-header";

/** Standard form section grouping. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <SectionHeader title={title} description={description} />
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function FormSectionFullWidth({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("sm:col-span-2", className)}>{children}</div>;
}
