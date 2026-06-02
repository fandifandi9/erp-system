"use client";

import Link from "next/link";
import { Upload, Settings, Store, ArrowRight, Globe } from "lucide-react";

const cards = [
  {
    href: "/bisnis/penjualan-online/import",
    title: "Import Penjualan",
    desc: "Upload Excel → pilih template kalkulasi → review biaya → posting invoice",
    icon: Upload,
    color: "bg-indigo-50 text-indigo-600",
  },
  {
    href: "/bisnis/penjualan-online/pengaturan",
    title: "Pengaturan MP",
    desc: "Platform, tier, biaya per SKU & mapping toko",
    icon: Settings,
    color: "bg-emerald-50 text-emerald-600",
  },
];

export default function PenjualanOnlinePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Globe className="h-4 w-4" />
            Penjualan Online / Marketplace
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Penjualan Online</h1>
          <p className="mt-1 text-sm text-slate-500">
            Import massal dari Excel marketplace dengan kalkulasi biaya otomatis per toko, channel, dan tier seller.
          </p>
        </div>

        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Setup awal:</strong> buat collection PocketBase sesuai{" "}
          <code className="rounded bg-amber-100 px-1">POCKETBASE_MP_SALES_SETUP.md</code>, lalu atur akun toko-MP dan
          rule biaya sebelum import.
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
            >
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${c.color}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 group-hover:text-indigo-700">{c.title}</h2>
              <p className="mt-1 flex-1 text-sm text-slate-500">{c.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600">
                Buka <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Store className="h-4 w-4" /> Alur kerja
          </h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>Atur channel (Tokopedia, Shopee, …) + akun toko per tier seller</li>
            <li>Atur channel + tier + biaya di Pengaturan Penjualan Online</li>
            <li>Hitung rekomendasi harga jual di menu <strong>Kalkulasi Harga Jual</strong> (sidebar)</li>
            <li>SKU master SERBA dipakai otomatis saat import — tidak perlu mapping manual</li>
            <li>Download template Excel → isi data order MP → upload</li>
            <li>Review staging (valid/error) → posting batch → invoice + stok keluar</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
