"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { getOperationalDashboardRoute } from "@/lib/rbac";
import Image from "next/image";
import { Clock, LayoutGrid, Loader2, Smartphone } from "lucide-react";

export default function EntryChoicePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const sync = () => {
      const m = pb.authStore.model as Record<string, unknown> | null;
      if (!m) {
        router.replace("/login");
        return;
      }
      setSessionUser(m);
      setReady(true);
    };
    sync();
    return pb.authStore.onChange(sync);
  }, [router]);

  const opsDashboard = useMemo(
    () => (sessionUser ? getOperationalDashboardRoute(sessionUser) : null),
    [sessionUser]
  );

  if (!ready || !sessionUser) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-50 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-sm text-slate-600">Memuat…</p>
      </div>
    );
  }

  const cardBase =
    "flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md active:scale-[0.99]";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-indigo-50/40 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-md flex-col gap-6 pt-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <Image src="/icons/icon-192.png" alt="" width={48} height={48} className="h-11 w-11 object-cover" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Mulai dari mana?</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Pilih <strong>Absensi</strong> untuk tampilan HP (clock-in, cuti, riwayat, profil). Pilih{" "}
            <strong>Dashboard</strong> untuk tugas HR, manajemen, atau modul web di komputer/tablet.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Link href="/attendance" className={cardBase}>
            <span className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Smartphone className="h-6 w-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <Clock className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  Absensi &amp; modul HP
                </span>
                <span className="mt-1 block text-sm text-slate-600">
                  Absensi GPS, riwayat, cuti, aktivitas luar, profil — dioptimalkan untuk layar kecil.
                </span>
              </span>
            </span>
          </Link>

          {opsDashboard ? (
            <Link href={opsDashboard} className={cardBase}>
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800">
                  <LayoutGrid className="h-6 w-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-900">Dashboard kerja</span>
                  <span className="mt-1 block text-sm text-slate-600">
                    Halaman sidebar untuk HR, Owner, manajer/staf operasional — slip gaji, lembur, HR,
                    pengaturan sesuai akses Anda.
                  </span>
                </span>
              </span>
            </Link>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-4 text-center text-sm text-slate-500">
              Akun ini tidak memiliki dashboard web. Gunakan{" "}
              <strong className="text-slate-700">Absensi &amp; modul HP</strong> di atas.
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-500">
          Anda bisa mengganti mode kapan saja lewat menu di dalam aplikasi.
        </p>
      </div>
    </div>
  );
}
