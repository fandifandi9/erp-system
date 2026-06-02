"use client";

import { useRef, useState, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

type Props = {
  label?: string;
  children: ReactNode;
};

export function ActionMenuDropdown({ label = "Tindakan", children }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuW = 176;
    const menuH = 140;
    const gap = 4;
    const openUp = rect.bottom + menuH > window.innerHeight - 8;
    const top = openUp ? rect.top - menuH - gap : rect.bottom + gap;
    const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
    setPos({ top, left });
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
      >
        {label} <MoreHorizontal className="ml-1 inline h-3.5 w-3.5" />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} aria-hidden />
            <div
              className="fixed z-[201] w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
              style={{ top: pos.top, left: pos.left }}
              onClick={() => setOpen(false)}
            >
              {children}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
