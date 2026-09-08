"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Printer } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder, type SalesOrderLine } from "@/lib/bisnis/types";
import { PickupHandoverReceipt } from "@/components/wms/PickupHandoverReceipt";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import { getErrorMessage } from "@/lib/errors";
import { PERMINTAAN_BARANG } from "@/lib/wms/permintaan-barang-routes";

export default function WmsPickupReceiptPage() {
  const params = useParams();
  const search = useSearchParams();
  const soId = typeof params.soId === "string" ? params.soId : "";
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [lines, setLines] = useState<{ sku: string; name: string; qty: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!soId) return;
    setLoading(true);
    setError("");
    try {
      const row = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
        expand: "warehouse,customer",
      });
      const soLines = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList<SalesOrderLine>({
        filter: `sales_order = "${soId}"`,
        expand: "product",
      });
      setSo(row);
      setLines(
        soLines.map((l) => ({
          sku: l.sku_snapshot || l.expand?.product?.sku || "—",
          name: l.name_snapshot || l.expand?.product?.name || l.product,
          qty: Number(l.qty) || 0,
        })),
      );
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [soId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || !so || search.get("print") !== "1") return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [loading, so, search]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !so) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        {error || "Order tidak ditemukan"}
        <div className="mt-4">
          <Link href={PERMINTAAN_BARANG.pickup} className="text-indigo-600 underline">
            Kembali ke Ready To Pickup
          </Link>
        </div>
      </div>
    );
  }

  const wf = parseOutboundWorkflow(so.outbound_workflow_json);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl justify-center gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          <Printer className="h-4 w-4" />
          Cetak
        </button>
        <Link
          href={PERMINTAAN_BARANG.pickup}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          Kembali
        </Link>
      </div>
      <PickupHandoverReceipt
        so={so}
        lines={lines}
        warehouseStaff={wf.pickup?.user_name ?? pb.authStore.model?.name as string | undefined}
        courierName={wf.pickup?.driver_name}
        courierPhone={wf.pickup?.driver_phone}
        courierCompany={wf.pickup?.courier_company}
      />
    </div>
  );
}
