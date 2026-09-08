import type { ReactNode } from "react";

/** White content surface on dark companion shell (staff panels stay readable). */
export function MobileContentShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-white text-slate-900 shadow-sm">
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}
