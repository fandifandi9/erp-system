"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/design/cn";

export type ToastTone = "success" | "error" | "info" | "loading";

export type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  detail?: string;
  duration?: number;
};

type ToastContextValue = {
  toast: (item: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setItems((prev) => [...prev, { ...item, id }]);
      if (item.tone !== "loading") {
        const ms = item.duration ?? 4500;
        setTimeout(() => dismiss(id), ms);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function Toaster({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  if (typeof document === "undefined" || items.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[500] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:top-6">
      {items.map((t) => (
        <ToastView key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>,
    document.body,
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const Icon =
    item.tone === "loading"
      ? Loader2
      : item.tone === "success"
        ? CheckCircle2
        : item.tone === "error"
          ? AlertCircle
          : Info;

  const ring =
    item.tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : item.tone === "error"
        ? "border-red-200 bg-red-50"
        : item.tone === "info"
          ? "border-sky-200 bg-sky-50"
          : "border-indigo-200 bg-indigo-50";

  const iconCls =
    item.tone === "success"
      ? "text-emerald-600"
      : item.tone === "error"
        ? "text-red-600"
        : item.tone === "info"
          ? "text-sky-600"
          : "text-indigo-600";

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg",
        ring,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconCls, item.tone === "loading" && "animate-spin")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-erp-text">{item.title}</p>
        {item.detail ? <p className="mt-0.5 text-xs text-erp-text-muted">{item.detail}</p> : null}
      </div>
      {item.tone !== "loading" ? (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-0.5 text-erp-text-subtle hover:bg-black/5"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
