"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-bold text-slate-800">Owner Dashboard</h1>
      <p className="text-slate-600">
        Ringkasan modul sedang disiapkan. Absensi pribadi dan profil tidak termasuk dashboard — gunakan menu{" "}
        <strong className="text-slate-800">nama Anda</strong> di pojok kanan atas, atau langsung{" "}
        <Link href="/attendance" className="font-medium text-indigo-600 underline-offset-2 hover:underline">
          Absensi
        </Link>{" "}
        dan{" "}
        <Link href="/profile" className="font-medium text-indigo-600 underline-offset-2 hover:underline">
          Profil
        </Link>
        .
      </p>
    </div>
  );
}
