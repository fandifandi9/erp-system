"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export type StandaloneAppHeaderProps = {
  /** Tautan logo + judul (mis. `/` → middleware ke dashboard kerja). */
  homeHref?: string;
  /** Label konteks halaman, mis. "Absensi" atau "Profil". */
  subtitle?: string;
  /** Tombol/link di kanan. */
  endSlot?: ReactNode;
};

/**
 * Header konsisten untuk rute di luar layout dashboard (logo + SERBA ERP).
 */
export default function StandaloneAppHeader({
  homeHref = "/",
  subtitle,
  endSlot,
}: StandaloneAppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 pt-[env(safe-area-inset-top,0px)] shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:min-h-[4rem] sm:gap-4 sm:px-6 sm:py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <Link
            href={homeHref}
            className="group flex min-w-0 shrink items-center gap-2 rounded-xl py-1 outline-none ring-offset-2 transition hover:bg-slate-50/80 focus-visible:ring-2 focus-visible:ring-indigo-500 sm:gap-3 sm:pr-1"
            aria-label="Beranda SERBA ERP"
          >
            <span className="relative flex h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5 sm:h-14 sm:w-14">
              <Image
                src="/icon"
                width={32}
                height={32}
                className="absolute inset-0 h-full w-full object-cover"
                alt=""
                priority
                sizes="(max-width: 640px) 44px, 56px"
              />
            </span>
            <span className="min-w-0 truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">
              SERBA ERP
            </span>
          </Link>
          {subtitle ? (
            <>
              <span className="hidden h-8 w-px shrink-0 bg-slate-200 lg:block" aria-hidden />
              <span className="hidden max-w-[10rem] truncate text-sm font-semibold text-slate-600 lg:inline xl:max-w-none xl:text-[0.9375rem]">
                {subtitle}
              </span>
            </>
          ) : null}
        </div>
        {endSlot ? (
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1 sm:gap-2">{endSlot}</div>
        ) : null}
      </div>
    </header>
  );
}
