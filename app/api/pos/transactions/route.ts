import { NextResponse } from "next/server";
import { requirePosApiUser } from "@/lib/pos/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { parsePosNotes } from "@/lib/pos/meta";
import { resolvePosPickupNo } from "@/lib/pos/pickup-resolve";
import type { SalesOrder } from "@/lib/bisnis/types";

const POS_META = "[[POS_META]]";

export type PosTransactionRow = {
  id: string;
  orderNo: string;
  mode: "direct" | "wms";
  total: number;
  created: string;
  buyerName?: string;
  buyerPhone?: string;
  courier?: string;
  shippingService?: string;
  pickupNo?: string;
  registerName?: string;
  invoiceId?: string;
};

export async function GET(req: Request) {
  try {
    await requirePosApiUser(req);
    const url = new URL(req.url);
    const storeId = url.searchParams.get("store")?.trim();
    const registerId = url.searchParams.get("register")?.trim();
    const scope = url.searchParams.get("scope") ?? "register";
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const perPage = Math.min(50, Math.max(1, Number(url.searchParams.get("perPage")) || 30));

    const adminPb = await getInventoryAdminPb();

    const res = await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(
      1,
      200,
      {
        filter: `notes ~ "${POS_META}"`,
        sort: "-created",
        fields: "id,order_no,total,created,notes,pk_no,wms_booking_no,outbound_workflow_json",
      },
    );

    const scoped = res.items.filter((so) => {
      const meta = parsePosNotes(so.notes);
      if (!meta) return false;
      if (scope === "store" && storeId) return meta.store_id === storeId;
      if (scope === "register" && registerId) return meta.register_id === registerId;
      return true;
    });

    const start = (page - 1) * perPage;
    const pageItems = scoped.slice(start, start + perPage);

    const invoiceMap = new Map<string, string>();
    if (res.items.length > 0) {
      const soIds = res.items.map((so) => so.id);
      const invFilter = soIds.map((id) => `sales_order = "${id}"`).join(" || ");
      try {
        const invRows = await adminPb.collection(BISNIS_COLLECTIONS.invoices).getFullList({
          filter: invFilter,
          fields: "id,sales_order",
          requestKey: null,
        });
        for (const inv of invRows) {
          const soRef = String((inv as { sales_order?: string }).sales_order ?? "");
          if (soRef && !invoiceMap.has(soRef)) {
            invoiceMap.set(soRef, String((inv as { id?: string }).id ?? ""));
          }
        }
      } catch {
        /* invoice lookup optional */
      }
    }

    const items = pageItems
      .map((so) => {
        const meta = parsePosNotes(so.notes);
        if (!meta) return null;
        const { pickupNo } =
          meta.mode === "wms" ? resolvePosPickupNo(so) : { pickupNo: undefined };
        return {
          id: so.id,
          orderNo: so.order_no,
          mode: meta.mode,
          total: Number(so.total) || 0,
          created: so.created,
          buyerName: meta.buyer_name?.trim() || undefined,
          buyerPhone: meta.buyer_phone?.trim() || undefined,
          courier: meta.shipping?.courier,
          shippingService: meta.shipping?.service,
          pickupNo,
          registerName: meta.register_name,
          invoiceId: invoiceMap.get(so.id),
        } satisfies PosTransactionRow;
      })
      .filter((x) => x !== null) as PosTransactionRow[];

    const totalItems = scoped.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));

    return NextResponse.json({
      items,
      page,
      perPage,
      totalItems,
      totalPages,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal memuat transaksi" },
      { status },
    );
  }
}
