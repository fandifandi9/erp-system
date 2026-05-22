"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { fetchBalances, fetchMovements, fetchProducts, fetchWarehouses } from "@/lib/inventory/client";
import { formatIntegerId } from "@/lib/format-number";
import { AlertTriangle, ArrowRight, Package } from "lucide-react";

export default function InventoryDashboardPage() {
  const [stats, setStats] = useState({
    products: 0,
    warehouses: 0,
    lowStock: 0,
    draftMovements: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [products, warehouses, balances, drafts] = await Promise.all([
          fetchProducts({ page: 1 }),
          fetchWarehouses(),
          fetchBalances(),
          fetchMovements({ status: "draft", page: 1 }),
        ]);
        const low = balances.filter((b) => {
          const p = b.expand?.product;
          const min = p?.min_stock ?? 0;
          return min > 0 && (b.qty_on_hand ?? 0) < min;
        });
        setStats({
          products: products.totalItems,
          warehouses: warehouses.length,
          lowStock: low.length,
          draftMovements: drafts.totalItems,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <InventoryGate>
      <InventoryShell
        title="Ringkasan inventory"
        subtitle="Monitoring stok realtime, movement, dan master data gudang."
      >
        {loading ? (
          <p className="text-sm text-slate-500">Memuat…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Produk aktif" value={formatIntegerId(stats.products)} href="/inventory/products" />
            <StatCard label="Gudang" value={formatIntegerId(stats.warehouses)} href="/inventory/warehouses" />
            <StatCard
              label="Stok di bawah minimum"
              value={formatIntegerId(stats.lowStock)}
              href="/inventory/stock"
              warn={stats.lowStock > 0}
            />
            <StatCard
              label="Movement draft"
              value={formatIntegerId(stats.draftMovements)}
              href="/inventory/movements"
            />
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800">Langkah cepat</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <Link href="/inventory/products" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                Kelola master produk <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
            <li>
              <Link href="/inventory/movements/new" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                Buat movement masuk/keluar <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
            <li>
              <Link href="/inventory/stock" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                Lihat stok per gudang <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
            <li>
              <Link href="/inventory/zones" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                Kelola zona &amp; QR <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
            <li>
              <Link href="/inventory/zones/checkin" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                Check-in zona kerja <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          </ul>
        </div>
      </InventoryShell>
    </InventoryGate>
  );
}

function StatCard({
  label,
  value,
  href,
  warn,
}: {
  label: string;
  value: string;
  href: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "rounded-xl border p-4 shadow-sm transition hover:shadow-md " +
        (warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white")
      }
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
        {warn ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Package className="h-4 w-4 text-slate-400" />}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </Link>
  );
}
