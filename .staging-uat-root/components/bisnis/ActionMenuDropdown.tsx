"use client";

import {
  createContext,
  useRef,
  useState,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

export const ActionMenuCloseContext = createContext<() => void>(() => {});

type Props = {
  label?: string;
  /** Tombol ikon saja — untuk baris tabel padat. */
  iconOnly?: boolean;
  children: ReactNode;
};

export function ActionMenuDropdown({ label, iconOnly, children }: Props) {
  const { t } = useLocale();
  const actionLabel = label ?? t("common.actions");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuW = 220;
    const menuH = 200;
    const gap = 4;
    const openUp = rect.bottom + menuH > window.innerHeight - 8;
    const top = openUp ? rect.top - menuH - gap : rect.bottom + gap;
    const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
    setPos({ top, left });
  }, [open]);

  return (
    <ActionMenuCloseContext.Provider value={close}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={actionLabel}
        className={
          iconOnly
            ? "inline-flex rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            : "rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        }
      >
        {iconOnly ? (
          <MoreHorizontal className="h-4 w-4" />
        ) : (
          <>
            {actionLabel} <MoreHorizontal className="ml-1 inline h-3.5 w-3.5" />
          </>
        )}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[200]" onClick={close} aria-hidden />
            <div
              className="fixed z-[201] min-w-[13.5rem] rounded-lg border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
              style={{ top: pos.top, left: pos.left }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </div>
          </>,
          document.body,
        )}
    </ActionMenuCloseContext.Provider>
  );
}
