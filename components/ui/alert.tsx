import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/design/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const toneStyles: Record<AlertTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border-sky-200 bg-erp-info-soft text-sky-900", icon: "text-sky-600", Icon: Info },
  success: {
    box: "border-emerald-200 bg-erp-success-soft text-emerald-900",
    icon: "text-emerald-600",
    Icon: CheckCircle2,
  },
  warning: {
    box: "border-amber-200 bg-erp-warning-soft text-amber-950",
    icon: "text-amber-600",
    Icon: TriangleAlert,
  },
  danger: {
    box: "border-red-200 bg-erp-danger-soft text-red-900",
    icon: "text-red-600",
    Icon: AlertCircle,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { box, icon, Icon } = toneStyles[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", box, className)} role="alert">
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", icon)} />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}
