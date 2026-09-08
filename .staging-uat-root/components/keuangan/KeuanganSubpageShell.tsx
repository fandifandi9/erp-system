"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
};

export function KeuanganSubpageShell({ title, description, children, action }: Props) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/keuangan"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Keuangan
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}
