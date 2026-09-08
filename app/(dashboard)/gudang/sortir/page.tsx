"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, PackageOpen, RotateCcw, AlertTriangle } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";
import { fetchCompanyProfiles } from "@/lib/bisnis/company-client";
import type { CompanyProfile } from "@/lib/bisnis/types";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { useLocale } from "@/components/LocaleProvider";

type TransitRow = {
  id: string;
  code: string;
  name: string;
  company?: string;
};

export default function GudangSortirPage() {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [transitWarehouses, setTransitWarehouses] = useState<TransitRow[]>([]);
  const [pendingReturs, setPendingReturs] = useState<Retur[]>([]);
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wh, returs, co] = await Promise.all([
        pb.collection(INV_COLLECTIONS.warehouses).getFullList<TransitRow>({
          filter: `is_active = true && warehouse_role = "transit"`,
          sort: "name",
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, 50, {
          filter:
            'type = "penjualan" && status = "completed" && wms_receive_status != "complete"',
          sort: "-completed_at",
          requestKey: null,
        }).then((r) => r.items),
        fetchCompanyProfiles(true).catch(() => [] as CompanyProfile[]),
      ]);
      setTransitWarehouses(wh);
      setPendingReturs(returs);
      setCompanies(co);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const companyName = (id?: string) =>
    companies.find((c) => c.id === id)?.company_name ?? t("inventory.common.entity");

  return (
    <InventoryGate>
      <InventoryShell title={t("inventory.sortir.title")}>
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <div className="mb-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <PackageOpen className="h-6 w-6 text-amber-600" /> {t("inventory.sortir.title")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              {t("inventory.sortir.subtitle")}
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="space-y-8">
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-rose-800">
                  <AlertTriangle className="h-4 w-4" /> {t("inventory.sortir.damagedLink")}
                </h2>
                <p className="mb-3 text-xs text-slate-500">
                  Barang sudah di karantina gudang rusak menunggu keputusan teknisi: perbaiki (kembali
                  ke gudang entitas/retail) atau buang (keluar sistem). Transfer ke gudang rusak wajib
                  satu entitas; masuk karantina otomatis draft write-down di Pengeluaran.
                </p>
                <Link
                  href="/gudang/servis-rusak"
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  Buka antrian servis gudang rusak →
                </Link>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-800">
                  Gudang Sementara
                </h2>
                {transitWarehouses.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-900">
                    {t("inventory.sortir.emptyTransit")}{" "}
                    <Link href="/gudang/daftar" className="font-semibold underline">
                      {t("inventory.daftar.title")}
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {transitWarehouses.map((w) => (
                      <div
                        key={w.id}
                        className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
                      >
                        <p className="font-semibold text-slate-900">{w.name}</p>
                        <p className="font-mono text-xs text-slate-400">{w.code}</p>
                        {w.company ? (
                          <p className="mt-1 text-xs text-indigo-600">{companyName(w.company)}</p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/gudang/stok?warehouse=${w.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
                          >
                            Lihat antrian stok
                          </Link>
                          <Link
                            href="/gudang/penerimaan"
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                          >
                            Penerimaan &amp; QC →
                          </Link>
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-amber-800/90">
                          Stok di sini sementara — pindah ke entitas/rusak otomatis setelah QC komplit,
                          bukan lewat mutasi manual.
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-700">
                  <RotateCcw className="h-4 w-4" /> Retur menunggu konfirmasi fisik
                </h2>
                {pendingReturs.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {t("inventory.sortir.emptyRetur")}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {pendingReturs.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-900">{r.retur_no}</p>
                          <p className="text-xs text-slate-500">Stok baik sudah di gudang sementara</p>
                        </div>
                        <Link
                          href={`/gudang/penerimaan/retur/${r.id}`}
                          className="text-sm font-medium text-indigo-600 hover:underline"
                        >
                          Konfirmasi penerimaan →
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </InventoryShell>
    </InventoryGate>
  );
}
