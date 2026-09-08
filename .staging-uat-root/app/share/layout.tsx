import { Suspense } from "react";
import { Loader2 } from "lucide-react";

function ShareLayoutFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
    </div>
  );
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Suspense fallback={<ShareLayoutFallback />}>{children}</Suspense>
    </div>
  );
}
