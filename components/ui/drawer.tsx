"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/design/cn";
import { Button } from "@/components/ui/button";

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-2xl" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close drawer" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="erp-drawer-title"
        className={cn(
          "relative flex h-full w-full flex-col border-l border-erp-border bg-erp-surface shadow-xl",
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-erp-border px-5 py-4">
          <div>
            <h2 id="erp-drawer-title" className="text-lg font-semibold text-erp-text">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-erp-text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-erp-text-subtle hover:bg-erp-surface-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-erp-border px-5 py-4">{footer}</div>
        ) : null}
      </aside>
    </div>
  );
}

export function DrawerFooterActions({
  onCancel,
  onSave,
  cancelLabel,
  saveLabel,
  loading,
}: {
  onCancel: () => void;
  onSave: () => void;
  cancelLabel: string;
  saveLabel: string;
  loading?: boolean;
}) {
  return (
    <>
      <Button variant="secondary" onClick={onCancel} disabled={loading}>
        {cancelLabel}
      </Button>
      <Button onClick={onSave} loading={loading}>
        {saveLabel}
      </Button>
    </>
  );
}
