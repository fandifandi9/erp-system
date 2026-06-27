export function PosShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pos-page-shell mx-auto w-full max-w-4xl px-4 py-6 pb-24 print:p-0 print:pb-0">
      <div className="pos-page-heading mb-6 print:hidden">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function PosCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

export function PosBigButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const cls =
    variant === "primary"
      ? "bg-indigo-600 text-white hover:bg-indigo-700"
      : variant === "danger"
        ? "bg-red-600 text-white hover:bg-red-700"
        : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[48px] w-full rounded-xl px-4 py-3 text-base font-semibold transition disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
