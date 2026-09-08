"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";

export type ProfileToastState = {
  kind: "success" | "error" | "loading";
  title: string;
  detail?: string;
} | null;

type Props = {
  toast: ProfileToastState;
  onDismiss: () => void;
};

/** Fixed viewport toast — visible regardless of scroll position. */
export function ProfileFeedbackToast({ toast, onDismiss }: Props) {
  useEffect(() => {
    if (!toast || toast.kind === "loading") return;
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast || typeof document === "undefined") return null;

  const Icon =
    toast.kind === "loading" ? Loader2 : toast.kind === "success" ? CheckCircle2 : AlertCircle;

  const ring =
    toast.kind === "success"
      ? "border-emerald-200 bg-emerald-50"
      : toast.kind === "error"
        ? "border-red-200 bg-red-50"
        : "border-indigo-200 bg-indigo-50";

  const iconCls =
    toast.kind === "success"
      ? "text-emerald-600"
      : toast.kind === "error"
        ? "text-red-600"
        : "text-indigo-600";

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-4 top-4 z-[400] flex justify-end sm:inset-x-auto sm:right-6 sm:top-6"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${ring}`}
      >
        <Icon
          className={`mt-0.5 h-5 w-5 shrink-0 ${iconCls} ${toast.kind === "loading" ? "animate-spin" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
          {toast.detail ? <p className="mt-0.5 text-xs text-slate-600">{toast.detail}</p> : null}
        </div>
        {toast.kind !== "loading" ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded p-0.5 text-slate-400 hover:bg-black/5 hover:text-slate-600"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
