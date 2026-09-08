"use client";

/**
 * Shared footer — Akses Mobile companion (same for HR / Staff / Finance / Manager shells).
 */

type Props = {
  onNavigate?: () => void;
};

export function WorkspaceMobileAccessFooter({ onNavigate }: Props) {
  return (
    <div className="mt-2 border-t border-slate-700/80 px-3 pt-3">
      <a
        href="/mobile"
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className="flex min-h-10 items-center justify-center rounded-lg border border-slate-600/80 px-3 py-2 text-xs font-medium text-sky-300 transition hover:border-sky-400/50 hover:bg-slate-800"
      >
        Akses Mobile
      </a>
      <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
        Companion operasional — tab baru; Desktop workspace tetap di tempat.
      </p>
    </div>
  );
}
