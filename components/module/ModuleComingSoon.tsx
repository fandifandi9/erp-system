import Link from "next/link";
import { Construction } from "lucide-react";

type Props = {
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
};

export function ModuleComingSoon({
  title,
  description,
  backHref = "/keuangan",
  backLabel = "Kembali ke Keuangan",
}: Props) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
      <Construction className="mx-auto h-12 w-12 text-slate-300" />
      <h1 className="mt-4 text-xl font-bold text-slate-800">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-amber-600">Segera hadir</p>
      {backHref ? (
        <Link
          href={backHref}
          className="mt-6 inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {backLabel}
        </Link>
      ) : null}
    </div>
  );
}
