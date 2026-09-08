"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PackageOpen,
  ShoppingCart,
  PackageCheck,
  ClipboardCheck,
  Activity,
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
import { fetchWmsDashboardStats } from "@/lib/wms/dashboard-stats-client";
import type { WmsDashboardStockPreview } from "@/lib/wms/dashboard-stats-server";
import { formatIntegerId } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

export default function WmsDashboardPage() {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stats, setStats] = useState({
    inboundQueue: 0,
    lowStock: 0,
    outboundTotal: 0,
    outboundPicking: 0,
    outboundValidate: 0,
    outboundPickup: 0,
    productSkus: 0,
  });
  const [stockPreview, setStockPreview] = useState<WmsDashboardStockPreview[]>([]);

  useEffect(() => {
    void (async () => {
      setLoadError("");
      try {
        const data = await fetchWmsDashboardStats();
        setStats({
          inboundQueue: data.inboundQueue,
          lowStock: data.lowStock,
          outboundTotal: data.outbound.total,
          outboundPicking: data.outbound.picking,
          outboundValidate: data.outbound.validate,
          outboundPickup: data.outbound.pickup,
          productSkus: data.productSkus,
        });
        setStockPreview(data.stockPreview);
      } catch {
        setLoadError(t("wms.hub.errLoad"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  return (
    <InventoryGate>
      <InventoryShell title="" subtitle="" module="wms">
        <WmsHero
          eyebrow={t("wms.hub.eyebrow")}
          title={t("wms.hub.title")}
          subtitle={t("wms.hub.subtitle")}
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
              label={t("wms.hub.statSkus")}
              value={formatIntegerId(stats.productSkus)}
              sub={t("wms.hub.statSkusSub")}
              icon={Package}
              href="/gudang/stok"
              accent="emerald"
            />
            <WmsStatCard
              label={t("wms.hub.statInbound")}
              value={formatIntegerId(stats.inboundQueue)}
              sub={t("wms.hub.statInboundSub")}
              icon={PackageOpen}
              href="/gudang/penerimaan"
              accent="amber"
              warn={stats.inboundQueue > 0}
            />
            <WmsStatCard
              label={t("wms.hub.statLowStock")}
              value={formatIntegerId(stats.lowStock)}
              sub={t("wms.hub.statLowStockSub")}
              icon={AlertTriangle}
              href="/gudang/stok"
              accent="amber"
              warn={stats.lowStock > 0}
            />
            <WmsStatCard
              label={t("wms.hub.statOutbound")}
              value={formatIntegerId(stats.outboundTotal)}
              sub={
                stats.outboundTotal > 0
                  ? t("wms.hub.statOutboundSub", {
                      picking: stats.outboundPicking,
                      validate: stats.outboundValidate,
                      pickup: stats.outboundPickup,
                    })
                  : t("wms.hub.statOutboundEmpty")
              }
              icon={PackageCheck}
              href="/wms/permintaan-barang"
              accent="violet"
              warn={stats.outboundTotal > 0}
            />
          </div>
        )}

        {!loading && stockPreview.length > 0 ? (
          <WmsCard>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">{t("wms.hub.stockPreview")}</p>
              <Link href="/gudang/stok" className="text-sm font-medium text-indigo-600 hover:underline">
                {t("wms.hub.stockFull")}
              </Link>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="pb-2 pr-4">{t("wms.hub.colSku")}</th>
                    <th className="pb-2 pr-4">{t("wms.hub.colProduct")}</th>
                    <th className="pb-2 pr-4">{t("wms.hub.colWarehouse")}</th>
                    <th className="pb-2 text-right">{t("wms.hub.colOnHand")}</th>
                  </tr>
                </thead>
                <tbody>
                  {stockPreview.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="py-2 font-mono text-xs">{b.product?.sku || "—"}</td>
                      <td className="py-2">{b.product?.name || "—"}</td>
                      <td className="py-2 text-slate-600">{b.warehouse?.name || "—"}</td>
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
              {t("wms.hub.noStock")}
            </p>
            <Link
              href="/bisnis/pembelian/buat"
              className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:underline"
            >
              {t("wms.hub.createPurchase")}
            </Link>
          </WmsCard>
        ) : null}

        <WmsCard>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("wms.hub.outboundFlow")}</p>
          <div className="mt-3 overflow-x-auto pb-1">
            <WmsFlowBar steps={WMS_OUTBOUND_FLOW} activeIndex={0} />
          </div>
        </WmsCard>

        <div>
          <p className="mb-3 text-sm font-semibold text-slate-700">{t("wms.hub.quickOps")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <WmsNavTile
              href="/gudang/penerimaan"
              label={t("wms.hub.tileReceiving")}
              description={t("wms.hub.tileReceivingDesc")}
              icon={PackageOpen}
              accent="emerald"
            />
            <WmsNavTile
              href="/wms/permintaan-barang"
              label={t("wms.hub.tileRequest")}
              description={t("wms.hub.tileRequestDesc")}
              icon={ShoppingCart}
              accent="violet"
            />
            <WmsNavTile
              href="/gudang/stok"
              label={t("wms.hub.tileGlobalStock")}
              icon={Boxes}
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
            {t("wms.hub.hintPrefix")}{" "}
            <Link href="/gudang/stok" className="font-semibold text-indigo-600 hover:underline">
              {t("wms.hub.hintWarehouseStock")}
            </Link>
            {t("wms.hub.hintMid")}{" "}
            <Link href="/katalog/produk" className="font-semibold text-indigo-600 hover:underline">
              {t("wms.hub.hintBusinessProducts")}
            </Link>
            .
          </p>
        </WmsCard>
      </InventoryShell>
    </InventoryGate>
  );
}
