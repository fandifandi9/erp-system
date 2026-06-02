"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PackageOpen,
  ShieldCheck,
  MapPinned,
  ShoppingCart,
  PackageCheck,
  ClipboardCheck,
  Activity,
  QrCode,
  AlertTriangle,
  Package,
  Boxes,
} from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  WmsHero,
  WmsNavTile,
  WmsStatCard,
  WmsFlowBar,
  WmsCard,
  WmsLoading,
} from "@/components/wms/ui";
import { WMS_FLOW_STEPS, WMS_OUTBOUND_FLOW } from "@/lib/wms/navigation";
import { fetchBalances, fetchMovements, fetchPackingSessions } from "@/lib/inventory/client";
import { formatIntegerId } from "@/lib/format-number";
import type { InvStockBalance } from "@/lib/inventory/types";

export default function WmsDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stats, setStats] = useState({
    draftMovements: 0,
    lowStock: 0,
    openPacking: 0,
    productSkus: 0,
  });
  const [stockPreview, setStockPreview] = useState<InvStockBalance[]>([]);

  useEffect(() => {
    void (async () => {
      setLoadError("");
      try {
        const [draftsRes, balancesRes, packingRes] = await Promise.allSettled([
          fetchMovements({ status: "draft", page: 1 }),
          fetchBalances(),
          fetchPackingSessions(),
        ]);

        const drafts =
          draftsRes.status === "fulfilled" ? draftsRes.value : { totalItems: 0 };
        const balances = balancesRes.status === "fulfilled" ? balancesRes.value : [];
        const packing =
          packingRes.status === "fulfilled"
            ? packingRes.value
            : { items: [] as { status?: string }[], totalItems: 0 };

        if (draftsRes.status === "rejected" && balancesRes.status === "rejected") {
          setLoadError("Gagal memuat data gudang. Periksa koneksi PocketBase dan koleksi inventory.");
        }

        const low = balances.filter((b) => {
          const p = b.expand?.product;
          const min = p?.min_stock ?? 0;
          return min > 0 && (b.qty_on_hand ?? 0) < min;
        });
        const openPack = (packing.items as { status?: string }[]).filter(
          (s) => s.status === "open" || s.status === "in_progress",
        ).length;

        const withStock = balances.filter((b) => (b.qty_on_hand ?? 0) > 0);
        const uniqueProducts = new Set(withStock.map((b) => b.product));

        setStats({
          draftMovements: drafts.totalItems ?? 0,
          lowStock: low.length,
          openPacking: openPack,
          productSkus: uniqueProducts.size,
        });
        setStockPreview(withStock.slice(0, 12));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <InventoryGate>
      <InventoryShell title="" subtitle="" module="wms">
        <WmsHero
          eyebrow="WMS Operation"
          title="Operasi Gudang"
          subtitle="Operasional gudang — produk & stok dari master pusat Manajemen Bisnis (bukan daftar produk terpisah)."
        >
          <WmsFlowBar steps={WMS_FLOW_STEPS} activeIndex={1} />
        </WmsHero>

        {loadError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {loadError}
          </div>
        ) : null}

        {loading ? (
          <WmsLoading />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <WmsStatCard
              label="SKU ada stok"
              value={formatIntegerId(stats.productSkus)}
              sub="Di semua gudang"
              icon={Package}
              href="/gudang/stok"
              accent="emerald"
            />
            <WmsStatCard
              label="Draf mutasi"
              value={formatIntegerId(stats.draftMovements)}
              sub="Belum mempengaruhi stok"
              icon={PackageOpen}
              href="/gudang/penerimaan"
              accent="amber"
              warn={stats.draftMovements > 0}
            />
            <WmsStatCard
              label="Stok kritis"
              value={formatIntegerId(stats.lowStock)}
              sub="Di bawah minimum"
              icon={AlertTriangle}
              href="/gudang/stok"
              accent="amber"
              warn={stats.lowStock > 0}
            />
            <WmsStatCard
              label="Kemasan aktif"
              value={formatIntegerId(stats.openPacking)}
              icon={PackageCheck}
              href="/gudang/packing"
              accent="violet"
            />
          </div>
        )}

        {!loading && stockPreview.length > 0 ? (
          <WmsCard>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">Produk dengan saldo stok (preview)</p>
              <Link href="/gudang/stok" className="text-sm font-medium text-indigo-600 hover:underline">
                Stok global lengkap →
              </Link>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="pb-2 pr-4">SKU</th>
                    <th className="pb-2 pr-4">Produk</th>
                    <th className="pb-2 pr-4">Gudang</th>
                    <th className="pb-2 text-right">On hand</th>
                  </tr>
                </thead>
                <tbody>
                  {stockPreview.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="py-2 font-mono text-xs">{b.expand?.product?.sku || "—"}</td>
                      <td className="py-2">{b.expand?.product?.name || b.product}</td>
                      <td className="py-2 text-slate-600">{b.expand?.warehouse?.name || "—"}</td>
                      <td className="py-2 text-right font-semibold">
                        {formatIntegerId(b.qty_on_hand)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </WmsCard>
        ) : !loading ? (
          <WmsCard className="border-dashed border-slate-200">
            <p className="text-sm text-slate-600">
              Belum ada saldo stok terposting. Buat <strong>pembelian</strong> di Manajemen Bisnis agar stok
              masuk, lalu refresh halaman ini.
            </p>
            <Link
              href="/bisnis/pembelian/buat"
              className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:underline"
            >
              Buat pembelian →
            </Link>
          </WmsCard>
        ) : null}

        <WmsCard>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Alur keluar</p>
          <div className="mt-3 overflow-x-auto pb-1">
            <WmsFlowBar steps={WMS_OUTBOUND_FLOW} activeIndex={0} />
          </div>
        </WmsCard>

        <div>
          <p className="mb-3 text-sm font-semibold text-slate-700">Operasi cepat</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <WmsNavTile
              href="/gudang/produk"
              label="Daftar produk"
              description="SKU, barcode, stok — tanpa harga"
              icon={Package}
              accent="indigo"
            />
            <WmsNavTile
              href="/gudang/penerimaan"
              label="Penerimaan"
              description="Scan barcode, master produk pusat"
              icon={PackageOpen}
              accent="emerald"
            />
            <WmsNavTile
              href="/gudang/qc"
              label="QC"
              icon={ShieldCheck}
              accent="amber"
            />
            <WmsNavTile
              href="/gudang/putaway"
              label="Putaway"
              icon={MapPinned}
              accent="indigo"
            />
            <WmsNavTile
              href="/gudang/picking"
              label="Picking"
              description="Sales order + scan"
              icon={ShoppingCart}
              accent="violet"
            />
            <WmsNavTile
              href="/gudang/packing"
              label="Packing"
              icon={PackageCheck}
              accent="cyan"
            />
            <WmsNavTile
              href="/gudang/stok"
              label="Stok global"
              icon={Boxes}
              accent="emerald"
            />
            <WmsNavTile
              href="/gudang/scanner"
              label="Scanner / zona"
              icon={QrCode}
              accent="emerald"
            />
            <WmsNavTile
              href="/gudang/opname"
              label="Opname"
              icon={ClipboardCheck}
              accent="amber"
            />
            <WmsNavTile
              href="/gudang/aktivitas"
              label="Aktivitas"
              icon={Activity}
              accent="indigo"
            />
          </div>
        </div>

        <WmsCard className="border-dashed border-indigo-200 bg-indigo-50/30">
          <p className="text-sm text-slate-600">
            Lihat semua produk (tanpa harga) di{" "}
            <Link href="/gudang/produk" className="font-semibold text-indigo-600 hover:underline">
              Gudang → Daftar Produk
            </Link>
            . Ubah master di{" "}
            <Link href="/bisnis/produk" className="font-semibold text-indigo-600 hover:underline">
              Manajemen Bisnis → Produk
            </Link>
            .
          </p>
        </WmsCard>
      </InventoryShell>
    </InventoryGate>
  );
}
