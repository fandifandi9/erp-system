"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/design/cn";
import { Button } from "@/components/ui/button";

export function Modal({
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
  title?: string;
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
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const width =
    size === "sm" ? "max-w-md" : size === "lg" ? "max-w-2xl" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "erp-modal-title" : undefined}
        className={cn("w-full rounded-xl border border-erp-border bg-erp-surface shadow-xl", width, className)}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-erp-border px-5 py-4">
            <div>
              {title ? (
                <h2 id="erp-modal-title" className="text-lg font-semibold text-erp-text">
                  {title}
                </h2>
              ) : null}
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
        )}
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-erp-border px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  onConfirm,
  loading,
  variant = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  variant?: "default" | "danger";
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            loading={loading}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div />
    </Modal>
  );
}
