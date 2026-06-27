"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { fetchBalances, fetchMovements, fetchProducts, fetchWarehouses } from "@/lib/inventory/client";
import { formatIntegerId } from "@/lib/format-number";
import {
  WmsHero,
  WmsStatCard,
  WmsNavTile,
  WmsCard,
  WmsLoading,
} from "@/components/wms/ui";
import { AlertTriangle, ArrowLeftRight, Boxes, Package, Warehouse } from "lucide-react";

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
    <InventoryGate requireErpCore>
      <InventoryShell title="" subtitle="">
        <WmsHero
          eyebrow="ERP Core"
          title="Inventori & Stok"
          subtitle="Pusat data master, saldo stok, dan mutasi — terhubung ke operasi gudang (WMS)."
        >
          <Link
            href="/wms"
            className="inline-flex items-center rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20"
          >
            Buka Operasi Gudang (WMS) →
          </Link>
        </WmsHero>

        {loading ? (
          <WmsLoading />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <WmsStatCard
              label="Produk aktif"
              value={formatIntegerId(stats.products)}
              icon={Package}
              href="/inventory/products"
            />
            <WmsStatCard
              label="Gudang"
              value={formatIntegerId(stats.warehouses)}
              icon={Warehouse}
              href="/inventory/warehouses"
            />
            <WmsStatCard
              label="Stok kritis"
              value={formatIntegerId(stats.lowStock)}
              icon={AlertTriangle}
              href="/inventory/stock"
              accent="amber"
              warn={stats.lowStock > 0}
            />
            <WmsStatCard
              label="Draf mutasi"
              value={formatIntegerId(stats.draftMovements)}
              icon={ArrowLeftRight}
              href="/inventory/movements"
              accent="violet"
            />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <WmsNavTile
            href="/inventory/stock"
            label="Stok realtime"
            description="Saldo, reserved, available per gudang"
            icon={Boxes}
            accent="indigo"
          />
          <WmsNavTile
            href="/inventory/movements"
            label="Mutasi stok"
            description="Riwayat & posting mutasi"
            icon={ArrowLeftRight}
            accent="violet"
          />
          <WmsNavTile
            href="/inventory/products"
            label="Master produk"
            description="SKU, barcode, minimum stok"
            icon={Package}
            accent="cyan"
          />
          <WmsNavTile
            href="/wms/receiving"
            label="Penerimaan (WMS)"
            description="Goods receipt operasional"
            icon={Warehouse}
            accent="emerald"
          />
        </div>

        <WmsCard>
          <h2 className="font-semibold text-slate-800">Alur bisnis</h2>
          <p className="mt-2 text-sm text-slate-600">
            Purchase & sales dikelola di modul ERP. Operasional gudang (receiving → QC → picking →
            packing) di <Link href="/wms" className="font-medium text-indigo-600 hover:underline">WMS</Link>.
            Satu stock engine untuk semua mutasi.
          </p>
        </WmsCard>
      </InventoryShell>
    </InventoryGate>
  );
}
