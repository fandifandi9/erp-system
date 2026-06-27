"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Monitor, Store, Warehouse, User, Globe } from "lucide-react";
import { fetchPosRegisters } from "@/lib/pos/registers";
import { resolveCashierFromAuth } from "@/lib/pos/cashier";
import { fetchStores, fetchSalesChannels, fetchMpSellerTiers } from "@/lib/bisnis/client";
import { fetchMpFeeTemplates } from "@/lib/bisnis/mp-template-client";
import {
  buildPosMarketplaceOptions,
  resolvePosMarketplaceAccount,
  type PosMarketplaceOption,
} from "@/lib/pos/marketplace-options";
import { pb } from "@/lib/pocketbase";
import type { PosRegister, PosSaleMode, PosSession } from "@/lib/pos/types";
import type { Store as BizStore, SalesChannel, MpSellerTier, MpFeeTemplate, StoreChannelAccount } from "@/lib/bisnis/types";
import { savePosSession, clearPosCart } from "@/lib/pos/session";
import { posModeLabel } from "@/lib/pos/meta";
import { PosShell, PosCard, PosBigButton } from "@/components/pos/PosShell";
import Link from "next/link";

export default function PosSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [registers, setRegisters] = useState<PosRegister[]>([]);
  const [stores, setStores] = useState<BizStore[]>([]);
  const [salesChannels, setSalesChannels] = useState<SalesChannel[]>([]);
  const [sellerTiers, setSellerTiers] = useState<MpSellerTier[]>([]);
  const [feeTemplates, setFeeTemplates] = useState<MpFeeTemplate[]>([]);
  const [starting, setStarting] = useState(false);

  const [selectedId, setSelectedId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [mode, setMode] = useState<PosSaleMode>("direct");
  const [channelId, setChannelId] = useState("");
  const [cashierName, setCashierName] = useState("");
  const [cashierPhone, setCashierPhone] = useState("");
  const [cashierUserId, setCashierUserId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [regs, st, sc, tr, tpl, cashier] = await Promise.all([
          fetchPosRegisters(true),
          fetchStores(true),
          fetchSalesChannels(true).catch(() => [] as SalesChannel[]),
          fetchMpSellerTiers().catch(() => [] as MpSellerTier[]),
          fetchMpFeeTemplates({ sort: "sort_order,name" }).catch(() => [] as MpFeeTemplate[]),
          resolveCashierFromAuth(),
        ]);
        setRegisters(regs);
        setStores(st);
        setSalesChannels(sc);
        setSellerTiers(tr);
        setFeeTemplates(tpl);
        if (regs[0]) setSelectedId(regs[0].id);
        if (st[0]) {
          setStoreId(st[0].id);
          if (st[0].default_warehouse) setWarehouseId(st[0].default_warehouse);
        }
        if (cashier) {
          setCashierName(cashier.name);
          setCashierPhone(cashier.phone);
          setCashierUserId(cashier.userId);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Gagal memuat data POS");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selected = registers.find((r) => r.id === selectedId);
  const selectedStore = stores.find((s) => s.id === storeId);
  const lockedWarehouse = selectedStore?.expand?.default_warehouse;
  const marketplaceOptions: PosMarketplaceOption[] = buildPosMarketplaceOptions({
    channels: salesChannels,
    tiers: sellerTiers,
    templates: feeTemplates,
  });

  const onStoreChange = (id: string) => {
    setStoreId(id);
    const st = stores.find((s) => s.id === id);
    setWarehouseId(st?.default_warehouse ?? "");
  };

  const startSession = async () => {
    setStarting(true);
    setError("");
    try {
      if (!selected) {
        setError("Pilih terminal POS");
        return;
      }
      if (!storeId) {
        setError("Pilih toko untuk sesi ini");
        return;
      }
      if (!warehouseId) {
        setError(
          selectedStore
            ? `Toko "${selectedStore.name}" belum punya gudang default — atur di Bisnis → Toko.`
            : "Pilih toko untuk sesi ini",
        );
        return;
      }
      if (!cashierName.trim()) {
        setError("Nama kasir wajib diisi");
        return;
      }
      if (mode === "wms" && !channelId) {
        setError("Pilih marketplace untuk penjualan via MP");
        return;
      }

      const store = stores.find((s) => s.id === storeId);
      const warehouseName = lockedWarehouse?.name ?? "Gudang";
      const mpOpt = marketplaceOptions.find((o) => o.id === channelId);

      let resolvedAccount: StoreChannelAccount | undefined;
      if (mode === "wms") {
        resolvedAccount = await resolvePosMarketplaceAccount(storeId, channelId, marketplaceOptions);
      }

      const session: PosSession = {
        registerId: selected.id,
        registerName: selected.name,
        registerCode: selected.code,
        registerAddress: selected.address,
        cashierUserId: cashierUserId || String(pb.authStore.model?.id || ""),
        storeId,
        storeName: store?.name ?? storeId,
        warehouseId,
        warehouseName,
        responsibleName: cashierName.trim(),
        responsiblePhone: cashierPhone.trim(),
        mode,
        channelAccountId: mode === "wms" ? resolvedAccount?.id : undefined,
        channelAccountName: resolvedAccount?.account_name,
        channelName: mpOpt?.label.split(" · ")[0] ?? resolvedAccount?.expand?.channel?.name,
      };

      clearPosCart();
      savePosSession(session);
      router.push("/pos/sale");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal membuka sesi");
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <PosShell
      title="Buka sesi kasir"
      subtitle="Toko & gudang untuk stok. Marketplace untuk platform penjualan — keduanya independen per sesi."
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {registers.length === 0 ? (
        <PosCard>
          <p className="text-sm text-slate-600">
            Belum ada terminal POS. Buat di{" "}
            <Link href="/bisnis/pos-registers" className="font-medium text-indigo-600 hover:underline">
              Master POS
            </Link>{" "}
            (hanya nama, kode, alamat).
          </p>
        </PosCard>
      ) : (
        <>
          <PosCard className="mb-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Monitor className="h-4 w-4" /> Terminal POS
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {registers.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selectedId === r.id
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p className="font-bold text-slate-900">{r.name}</p>
                  <p className="font-mono text-xs text-slate-500">{r.code}</p>
                  {r.address && (
                    <p className="mt-1 text-xs text-slate-600">{r.address}</p>
                  )}
                </button>
              ))}
            </div>
          </PosCard>

          <PosCard className="mb-4 space-y-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <User className="h-4 w-4" /> Kasir (dari login Anda)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-600">Nama kasir</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3"
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">No. telepon</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3"
                  value={cashierPhone}
                  onChange={(e) => setCashierPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="Opsional"
                />
              </div>
            </div>
          </PosCard>

          <PosCard className="mb-4 space-y-4">
            <p className="text-sm font-semibold text-slate-800">Konteks penjualan sesi ini</p>
            <div>
              <label className="flex items-center gap-1 text-xs font-medium text-slate-600">
                <Store className="h-3.5 w-3.5" /> Toko *
              </label>
              <select
                value={storeId}
                onChange={(e) => onStoreChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              >
                <option value="">— Pilih toko —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs font-medium text-slate-600">
                <Warehouse className="h-3.5 w-3.5" /> Gudang
              </label>
              {storeId && lockedWarehouse ? (
                <p className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-slate-800">
                  {lockedWarehouse.code ? `${lockedWarehouse.code} — ` : ""}
                  {lockedWarehouse.name}
                </p>
              ) : storeId ? (
                <p className="mt-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Toko ini belum punya gudang default.{" "}
                  <Link href="/bisnis/store" className="font-semibold text-indigo-600 hover:underline">
                    Atur di master Toko
                  </Link>
                </p>
              ) : (
                <p className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Pilih toko terlebih dahulu
                </p>
              )}
              {storeId && lockedWarehouse ? (
                <p className="mt-1 text-xs text-slate-500">Gudang mengikuti toko — tidak bisa diganti di POS.</p>
              ) : null}
            </div>
          </PosCard>

          <PosCard className="mb-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Jenis penjualan</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setMode("direct");
                  setChannelId("");
                }}
                className={`rounded-xl border p-4 text-left ${
                  mode === "direct" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"
                }`}
              >
                <p className="font-bold text-slate-900">Offline / Langsung</p>
                <p className="mt-1 text-xs text-slate-600">
                  Stok gudang terpilih, invoice + struk langsung.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("wms")}
                className={`rounded-xl border p-4 text-left ${
                  mode === "wms" ? "border-violet-500 bg-violet-50" : "border-slate-200"
                }`}
              >
                <p className="font-bold text-slate-900">Online / Marketplace</p>
                <p className="mt-1 text-xs text-slate-600">
                  Penjualan via MP, antrean WMS + review biaya.
                </p>
              </button>
            </div>
          </PosCard>

          {mode === "wms" && (
            <PosCard className="mb-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Globe className="h-4 w-4" /> Marketplace
              </p>
              <p className="mb-3 text-xs text-slate-500">
                Pilih platform & tier penjualan. Toko/gudang di atas menentukan stok & pengiriman.
              </p>
              {marketplaceOptions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Belum ada platform marketplace. Buat channel & tier di{" "}
                  <Link
                    href="/bisnis/marketplace"
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    Master Marketplace
                  </Link>
                  {" "}(rumus biaya opsional — web tanpa potongan tetap bisa dipilih).
                </p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {marketplaceOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChannelId(c.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left text-base transition ${
                        channelId === c.id
                          ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-900"
                          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </PosCard>
          )}

          <PosBigButton onClick={() => void startSession()} disabled={starting}>
            {starting ? "Menyiapkan…" : `Mulai — ${posModeLabel(mode)}`}
            {storeId && selectedStore ? ` · ${selectedStore.name}` : ""}
          </PosBigButton>
        </>
      )}
    </PosShell>
  );
}
