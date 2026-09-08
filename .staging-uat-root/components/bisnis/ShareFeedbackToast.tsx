"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";

export type ShareToastState = {
  kind: "success" | "error" | "loading" | "info";
  title: string;
  detail?: string;
} | null;

type Props = {
  toast: ShareToastState;
  onDismiss: () => void;
};

export function ShareFeedbackToast({ toast, onDismiss }: Props) {
  useEffect(() => {
    if (!toast || toast.kind === "loading") return;
    const t = setTimeout(onDismiss, 5200);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast || typeof document === "undefined") return null;

  const Icon =
    toast.kind === "loading"
      ? Loader2
      : toast.kind === "success"
        ? CheckCircle2
        : toast.kind === "error"
          ? AlertCircle
          : CheckCircle2;

  const ring =
    toast.kind === "success"
      ? "border-emerald-200 bg-emerald-50"
      : toast.kind === "error"
        ? "border-red-200 bg-red-50"
        : toast.kind === "loading"
          ? "border-indigo-200 bg-indigo-50"
          : "border-slate-200 bg-white";

  const iconCls =
    toast.kind === "success"
      ? "text-emerald-600"
      : toast.kind === "error"
        ? "text-red-600"
        : "text-indigo-600";

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[300] flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-share-toast-in ${ring}`}
      >
        <Icon
          className={`mt-0.5 h-5 w-5 shrink-0 ${iconCls} ${toast.kind === "loading" ? "animate-spin" : toast.kind === "success" ? "animate-share-pop" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
          {toast.detail && <p className="mt-0.5 text-xs text-slate-600">{toast.detail}</p>}
        </div>
        {toast.kind !== "loading" && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded p-0.5 text-slate-400 hover:bg-black/5 hover:text-slate-600"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
